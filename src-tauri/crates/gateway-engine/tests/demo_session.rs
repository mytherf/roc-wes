//! gateway-engine 端到端集成测试
//!
//! 覆盖三条关键链路：
//! 1. DemoAdapter 全链路：connect → subscribe → 周期遥测批量 → unsubscribe → disconnect；
//! 2. 重复 connect 的幂等保护（AlreadyExists）；
//! 3. 连接失败的指数退避重连：backoff 期间订阅照常登记，恢复连接后自动产出遥测。

use async_trait::async_trait;
use gateway_core::{
    DeviceAdapter, GatewayError, Quality, StatusEvent, Telemetry, TelemetryBatch,
};
use gateway_demo::DemoAdapter;
use gateway_engine::{EventSink, GatewayEngine};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// 内存事件收集器（测试用 EventSink 实现）
#[derive(Default)]
struct Collector {
    statuses: Mutex<Vec<StatusEvent>>,
    batches: Mutex<Vec<TelemetryBatch>>,
}

impl EventSink for Collector {
    fn status(&self, event: StatusEvent) {
        self.statuses.lock().unwrap().push(event);
    }
    fn telemetry(&self, batch: TelemetryBatch) {
        self.batches.lock().unwrap().push(batch);
    }
}

impl Collector {
    fn batch_count(&self) -> usize {
        self.batches.lock().unwrap().len()
    }

    fn last_batch(&self) -> Option<TelemetryBatch> {
        self.batches.lock().unwrap().last().cloned()
    }

    fn any_status(&self, connected: bool) -> bool {
        self.statuses
            .lock()
            .unwrap()
            .iter()
            .any(|s| s.connected == connected)
    }
}

/// 等待条件成立，超时则 panic
async fn wait_until<F: Fn() -> bool>(what: &str, timeout: Duration, cond: F) {
    let deadline = Instant::now() + timeout;
    loop {
        if cond() {
            return;
        }
        if Instant::now() > deadline {
            panic!("等待超时: {what}");
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn demo_session_streams_telemetry_and_stops() {
    let collector = Arc::new(Collector::default());
    let engine = GatewayEngine::new(collector.clone());

    // connect 是异步建连：命令立即返回，会话任务自行完成连接并推送状态
    engine
        .connect("dev-demo".into(), Box::new(DemoAdapter::default()), 200)
        .expect("创建会话应成功");

    // 重复 connect 同一设备必须被拒绝
    let dup = engine.connect("dev-demo".into(), Box::new(DemoAdapter::default()), 200);
    assert!(matches!(dup, Err(GatewayError::AlreadyExists(_))));

    // 波形档仅 sample-point 出数，故主订阅用固定点位；另订阅一个任意点位验证 null 语义
    engine
        .subscribe("dev-demo", gateway_demo::DEMO_SAMPLE_POINT_ID.into())
        .unwrap();
    engine.subscribe("dev-demo", "extra-point".into()).unwrap();

    // 收到连接成功状态 + 至少 3 批遥测（轮询下限 200ms，3 批约 0.6s）
    wait_until("连接状态上报", Duration::from_secs(2), || {
        collector.any_status(true)
    })
    .await;
    wait_until("遥测批量到达", Duration::from_secs(3), || {
        collector.batch_count() >= 3
    })
    .await;

    // 每批都应包含两个订阅点：sample-point 质量为 good 且为数值；
    // extra-point 非固定点位，运行期无数据 → 值为 null
    let batch = collector.last_batch().expect("应有遥测批次");
    assert_eq!(batch.device_id, "dev-demo");
    assert_eq!(batch.points.len(), 2);
    for p in &batch.points {
        assert!(p.timestamp > 0);
        if p.point_id == gateway_demo::DEMO_SAMPLE_POINT_ID {
            assert_eq!(p.quality, Quality::Good);
            assert!(p.value.is_number(), "演示值应为数值: {:?}", p.value);
        } else {
            assert!(p.value.is_null(), "非固定点位应为 null: {:?}", p.value);
        }
    }

    // 取消订阅后，后续批次只剩固定点位
    engine.unsubscribe("dev-demo", "extra-point".into()).unwrap();
    let before = collector.batch_count();
    wait_until("取消订阅生效", Duration::from_secs(2), || {
        collector.batch_count() > before
            && collector
                .last_batch()
                .map(|b| {
                    b.points.len() == 1
                        && b.points[0].point_id == gateway_demo::DEMO_SAMPLE_POINT_ID
                })
                .unwrap_or(false)
    })
    .await;

    // 断开：等待任务退出，并收到最终"会话已停止"状态
    engine.disconnect("dev-demo").await.unwrap();
    let statuses = collector.statuses.lock().unwrap();
    let last = statuses.last().expect("应有状态事件");
    assert!(!last.connected);
    assert!(last.message.contains("已停止"));

    // 会话已移除：再次订阅应报 NoSuchSession
    drop(statuses);
    let err = engine.subscribe("dev-demo", "x".into());
    assert!(matches!(err, Err(GatewayError::NoSuchSession(_))));
}

/// 前 N 次 connect 必失败的适配器，用于验证退避重连
struct FlakyAdapter {
    attempts: Arc<AtomicUsize>,
    fail_first: usize,
}

#[async_trait]
impl DeviceAdapter for FlakyAdapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        let n = self.attempts.fetch_add(1, Ordering::SeqCst) + 1;
        if n <= self.fail_first {
            Err(GatewayError::Connect(format!("模拟连接失败 #{n}")))
        } else {
            Ok(())
        }
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        let now = 1u64;
        Ok(point_ids
            .iter()
            .map(|p| Telemetry {
                point_id: p.clone(),
                value: serde_json::json!(42),
                timestamp: now,
                quality: Quality::Good,
            })
            .collect())
    }

    fn kind(&self) -> &'static str {
        "flaky"
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reconnects_with_backoff_after_connect_failure() {
    let collector = Arc::new(Collector::default());
    let engine = GatewayEngine::new(collector.clone());
    let attempts = Arc::new(AtomicUsize::new(0));

    engine
        .connect(
            "dev-flaky".into(),
            Box::new(FlakyAdapter {
                attempts: attempts.clone(),
                fail_first: 1,
            }),
            200,
        )
        .unwrap();

    // 首次失败立即上报 disconnected 状态
    wait_until("失败状态上报", Duration::from_secs(1), || {
        collector.any_status(false)
    })
    .await;

    // 退避等待期间订阅照常登记（不丢订阅）；控制指令还会提前唤醒退避循环，
    // 使下一次重试立即发生——这正是会话任务"退避期间仍响应指令"的设计行为
    engine.subscribe("dev-flaky", "point-a".into()).unwrap();

    // 初始退避 2s：第二次尝试建连成功 → 状态翻转为 connected，随后产出遥测
    wait_until("重连成功", Duration::from_secs(6), || {
        collector.any_status(true)
    })
    .await;
    wait_until("重连后遥测到达", Duration::from_secs(3), || {
        collector.batch_count() >= 1
    })
    .await;

    assert_eq!(attempts.load(Ordering::SeqCst), 2, "应恰好重试一次后成功");
    let batch = collector.last_batch().unwrap();
    assert_eq!(batch.points.len(), 1);
    assert_eq!(batch.points[0].point_id, "point-a");

    engine.disconnect("dev-flaky").await.unwrap();
}
