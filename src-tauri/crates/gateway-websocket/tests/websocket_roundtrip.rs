//! WebSocketAdapter 集成测试：内嵌 tokio-tungstenite 测试服务端，
//! 验证「订阅帧上行 + 数据帧下行」完整往返。

use futures_util::{SinkExt, StreamExt};
use gateway_core::{DemoProfile, DeviceAdapter, WebsocketConfig};
use gateway_websocket::WebSocketAdapter;
use std::time::{Duration, Instant};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;

/// 启动一个最小 WS 测试服务端：
/// 收到 `sensor.temp.001` 的 subscribe 帧后推送一条数据帧
async fn spawn_test_server() -> std::net::SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let (tcp, _) = listener.accept().await.unwrap();
        let mut ws = tokio_tungstenite::accept_async(tcp).await.unwrap();
        // 等待订阅帧
        while let Some(msg) = ws.next().await {
            if let Ok(Message::Text(t)) = msg {
                let v: serde_json::Value = serde_json::from_str(&t).unwrap();
                if v["action"] == "subscribe" && v["topic"] == "sensor.temp.001" {
                    break;
                }
            }
        }
        // 推送数据帧（含 timestamp/quality 字段验证透传）
        ws.send(Message::Text(
            r#"{"topic":"sensor.temp.001","value":42.5,"timestamp":1730000000000,"quality":"good"}"#
                .into(),
        ))
        .await
        .unwrap();
        // 保持连接直到测试结束
        tokio::time::sleep(Duration::from_secs(10)).await;
    });
    addr
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ws_subscribe_and_receive_roundtrip() {
    let addr = spawn_test_server().await;
    let mut adapter = WebSocketAdapter::new(WebsocketConfig {
        url: format!("ws://{addr}"),
        poll_interval_ms: 100,
        is_mock: false,
        profile: DemoProfile::default(),
        custom_data: None,
    });
    adapter.connect().await.unwrap();

    let point = "sensor.temp.001".to_string();
    // 轮询 read 直到数据到达（首轮 read 触发 subscribe 帧上行）
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut got = None;
    while Instant::now() < deadline {
        let batch = adapter.read(&[point.clone()]).await.unwrap();
        if let Some(t) = batch.into_iter().next() {
            got = Some(t);
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let t = got.expect("应收到服务端推送的遥测");
    assert_eq!(t.point_id, point);
    assert_eq!(t.value, serde_json::json!(42.5));
    assert_eq!(t.timestamp, 1730000000000);

    // 缓冲已排空：紧接着再读一次应无数据（未重复上报）
    let again = adapter.read(&[point.clone()]).await.unwrap();
    assert!(again.is_empty());

    adapter.disconnect().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ws_connect_failure_returns_connect_error() {
    // 无服务监听的端口：connect 应返回 Connect 错误
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    drop(listener); // 立即释放端口，确保连接被拒
    let mut adapter = WebSocketAdapter::new(WebsocketConfig {
        url: format!("ws://{addr}"),
        poll_interval_ms: 100,
        is_mock: false,
        profile: DemoProfile::default(),
        custom_data: None,
    });
    assert!(adapter.connect().await.is_err());
}
