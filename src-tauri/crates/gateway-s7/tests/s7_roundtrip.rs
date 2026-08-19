//! S7 适配器集成测试：基于 snap7-server 进程内 PLC 模拟器跑真实帧往返
//! （TPKT/COTP/S7 握手 + 多点批量读 + 大端解码），另覆盖连接失败路径。

use gateway_core::{DemoProfile, DeviceAdapter, Quality, S7Config};
use gateway_s7::S7Adapter;
use snap7_server::store::area;
use snap7_server::{DataStore, S7Server, ServerConfig};

fn cfg(port: u16) -> S7Config {
    S7Config {
        host: "127.0.0.1".to_string(),
        port,
        rack: 0,
        slot: 2,
        poll_interval_ms: 200,
        is_mock: false,
        profile: DemoProfile::default(),
    }
}

async fn start_simulator() -> (DataStore, std::net::SocketAddr) {
    let store = DataStore::new();
    store.register_area(area::MARKERS, 1024);
    store.register_area(area::PROCESS_INPUTS, 1024);
    store.register_area(area::PROCESS_OUTPUTS, 1024);
    let server = S7Server::bind(ServerConfig {
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        max_connections: 4,
    })
    .await
    .expect("绑定模拟 PLC 失败");
    let addr = server.local_addr().expect("获取模拟器地址失败");
    tokio::spawn(server.serve(store.clone()));
    (store, addr)
}

#[tokio::test]
async fn roundtrip_reads_points_against_simulator() {
    let (store, addr) = start_simulator().await;

    // 预置 DB1：REAL@0=1.5、INT@4=-2、字节@6 的 bit3=1、BYTE@10=42
    let mut db1 = vec![0u8; 16];
    db1[0..4].copy_from_slice(&1.5f32.to_be_bytes());
    db1[4..6].copy_from_slice(&(-2i16).to_be_bytes());
    db1[6] = 0b0000_1000;
    db1[10] = 42;
    store.write_bytes(1, 0, &db1);
    // 预置 Merker：MB10=0xAB
    store.write_area(area::MARKERS, 0, 10, &[0xAB]);

    let mut adapter = S7Adapter::new(cfg(addr.port()));
    adapter.connect().await.expect("连接模拟 PLC 失败");

    let points = vec![
        "DB1,REAL0".to_string(),
        "DB1,INT4".to_string(),
        "DB1,X6.3".to_string(),
        "MB10".to_string(),
    ];
    let batch = adapter.read(&points).await.expect("批量读失败");

    assert_eq!(batch.len(), 4, "应返回全部有效点位");
    assert_eq!(batch[0].point_id, "DB1,REAL0");
    assert_eq!(batch[0].value, serde_json::json!(1.5));
    assert_eq!(batch[1].value, serde_json::json!(-2));
    assert_eq!(batch[2].value, serde_json::json!(true));
    assert_eq!(batch[3].value, serde_json::json!(171));
    assert!(batch.iter().all(|t| t.quality == Quality::Good));
    assert!(batch.iter().all(|t| t.timestamp > 0));

    adapter.disconnect().await.expect("断开失败");
}

#[tokio::test]
async fn invalid_points_are_skipped_without_breaking_batch() {
    let (store, addr) = start_simulator().await;
    store.write_bytes(1, 0, &7u16.to_be_bytes());

    let mut adapter = S7Adapter::new(cfg(addr.port()));
    adapter.connect().await.expect("连接模拟 PLC 失败");

    // 非法点位（Modbus 风格 / 数组点）与合法点位混排：仅返回合法点位
    let points = vec![
        "holding:0".to_string(),
        "DB1,WORD0".to_string(),
        "DB1,REAL0.4".to_string(),
    ];
    let batch = adapter.read(&points).await.expect("含非法点位的轮询不应失败");
    assert_eq!(batch.len(), 1);
    assert_eq!(batch[0].point_id, "DB1,WORD0");
    assert_eq!(batch[0].value, serde_json::json!(7));
}

#[tokio::test]
async fn write_roundtrips_against_simulator() {
    let (store, addr) = start_simulator().await;

    // 预置 DB1（16B 全 0）与 Merker 区，保证写前地址存在
    store.write_bytes(1, 0, &vec![0u8; 16]);
    store.write_area(area::MARKERS, 0, 16, &[0u8; 16]);

    let mut adapter = S7Adapter::new(cfg(addr.port()));
    adapter.connect().await.expect("连接模拟 PLC 失败");

    // DB 标量写入：REAL/INT 写后读回一致
    adapter
        .write("DB1,REAL0", serde_json::json!(2.5))
        .await
        .expect("REAL 写入失败");
    adapter
        .write("DB1,INT4", serde_json::json!(-7))
        .await
        .expect("INT 写入失败");

    // 位点读-改-写：置 X6.0，不影响同字节其他位
    adapter
        .write("DB1,X6.0", serde_json::json!(true))
        .await
        .expect("位写入失败");

    // M 区字节写入
    adapter
        .write("MB10", serde_json::json!(99))
        .await
        .expect("MB 写入失败");

    let batch = adapter
        .read(&[
            "DB1,REAL0".to_string(),
            "DB1,INT4".to_string(),
            "DB1,X6.0".to_string(),
            "DB1,X6.3".to_string(),
            "MB10".to_string(),
        ])
        .await
        .expect("写后读回失败");

    assert_eq!(batch[0].value, serde_json::json!(2.5));
    assert_eq!(batch[1].value, serde_json::json!(-7));
    assert_eq!(batch[2].value, serde_json::json!(true), "置位应生效");
    assert_eq!(batch[3].value, serde_json::json!(false), "同字节其他位不应被误改");
    assert_eq!(batch[4].value, serde_json::json!(99));

    adapter.disconnect().await.expect("断开失败");
}

#[tokio::test]
async fn write_before_connect_fails_with_not_connected() {
    let mut adapter = S7Adapter::new(cfg(102));
    let err = adapter
        .write("DB1,REAL0", serde_json::json!(1.0))
        .await
        .expect_err("未连接写入应失败");
    assert!(matches!(err, gateway_core::GatewayError::NotConnected));
}

#[tokio::test]
async fn connect_failure_returns_connect_error() {
    // 先绑定再释放，得到一个确定无监听的端口
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let mut adapter = S7Adapter::new(cfg(port));
    let err = adapter.connect().await.expect_err("死端口应连接失败");
    assert!(matches!(err, gateway_core::GatewayError::Connect(_)));
}

#[tokio::test]
async fn read_before_connect_fails_with_not_connected() {
    let mut adapter = S7Adapter::new(cfg(102));
    let err = adapter
        .read(&["DB1,REAL0".to_string()])
        .await
        .expect_err("未连接读取应失败");
    assert!(matches!(err, gateway_core::GatewayError::NotConnected));
}
