//! OPC UA 适配器集成测试：连接失败路径（本机无可用 OPC UA 服务器，
//! 往返测试依赖真机/KEPServerEX，列入手册验收待办）。

use gateway_core::{DemoProfile, DeviceAdapter, GatewayError, OpcConfig};
use gateway_opcua::OpcuaAdapter;

fn cfg(endpoint: &str) -> OpcConfig {
    OpcConfig {
        endpoint: endpoint.to_string(),
        poll_interval_ms: 200,
        is_mock: false,
        profile: DemoProfile::default(),
        custom_data: None,
    }
}

#[tokio::test]
async fn connect_failure_returns_connect_error() {
    // 先绑定再释放，得到一个确定无监听的端口
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let mut adapter = OpcuaAdapter::new(cfg(&format!("opc.tcp://127.0.0.1:{port}")));
    let err = adapter.connect().await.expect_err("死端口应连接失败");
    assert!(matches!(err, GatewayError::Connect(_)));
}

#[tokio::test]
async fn read_before_connect_fails_with_not_connected() {
    let mut adapter = OpcuaAdapter::new(cfg("opc.tcp://127.0.0.1:4840"));
    let err = adapter
        .read(&["ns=2;s=Tag1".to_string()])
        .await
        .expect_err("未连接读取应失败");
    assert!(matches!(err, GatewayError::NotConnected));
}
