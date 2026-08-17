//! OPC UA 适配器（opcua crate 0.12，纯 Rust 协议栈）
//!
//! 点位 ID 合同（见数据源手册 opc §2）：NodeId 字符串语法
//! - `ns={n};s={str}`（字符串标识）
//! - `ns={n};i={num}`（数字标识）
//! 其他形式（含省略 ns 段）一律 InvalidPoint。
//!
//! 连接策略：匿名认证 + SecurityPolicy None（与旧 Node 网关行为对齐）。
//! opcua 0.12 客户端为同步阻塞 API（内部自带独立 tokio runtime），
//! 所有阻塞调用均经 `spawn_blocking` 执行，避免阻塞网关引擎的运行时线程。

use async_trait::async_trait;
use gateway_core::{DeviceAdapter, GatewayError, OpcConfig, Quality, Telemetry};
use opcua::client::prelude::*;
use opcua::sync::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, warn};

/// 解析点 ID 为 NodeId（合同：`ns={n};s={str}` 或 `ns={n};i={num}`）
fn parse_node_id(point_id: &str) -> Result<NodeId, GatewayError> {
    let invalid = || GatewayError::InvalidPoint(point_id.to_string());
    let (ns_part, rest) = point_id.split_once(';').ok_or_else(invalid)?;
    let ns_str = ns_part.strip_prefix("ns=").ok_or_else(invalid)?;
    let ns: u16 = ns_str.parse().map_err(|_| invalid())?;
    if let Some(s) = rest.strip_prefix("s=") {
        if s.is_empty() {
            return Err(invalid());
        }
        return Ok(NodeId::new(ns, s.to_string()));
    }
    if let Some(i) = rest.strip_prefix("i=") {
        let num: u32 = i.parse().map_err(|_| invalid())?;
        return Ok(NodeId::new(ns, num));
    }
    Err(invalid())
}

/// Variant 逐类型转换为 JSON 值；v1 不支持的类型返回 None（该点跳过并告警）
fn variant_to_json(v: &Variant) -> Option<serde_json::Value> {
    Some(match v {
        Variant::Empty => serde_json::Value::Null,
        Variant::Boolean(b) => serde_json::Value::from(*b),
        Variant::SByte(n) => serde_json::Value::from(*n),
        Variant::Byte(n) => serde_json::Value::from(*n),
        Variant::Int16(n) => serde_json::Value::from(*n),
        Variant::UInt16(n) => serde_json::Value::from(*n),
        Variant::Int32(n) => serde_json::Value::from(*n),
        Variant::UInt32(n) => serde_json::Value::from(*n),
        Variant::Int64(n) => serde_json::Value::from(*n),
        Variant::UInt64(n) => serde_json::Value::from(*n),
        Variant::Float(f) if f.is_finite() => serde_json::Value::from(*f),
        Variant::Double(f) if f.is_finite() => serde_json::Value::from(*f),
        Variant::String(s) => serde_json::Value::from(s.to_string()),
        Variant::DateTime(dt) => serde_json::Value::from(dt.to_rfc3339()),
        Variant::LocalizedText(lt) => serde_json::Value::from(lt.text.to_string()),
        _ => return None,
    })
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// DataValue → Telemetry；Bad 质量戳或无值点位返回 None（跳过）
fn data_value_to_telemetry(point_id: &str, dv: &DataValue, now_ms: u64) -> Option<Telemetry> {
    let quality = match dv.status {
        Some(s) if s.is_bad() => return None,
        Some(s) if s.is_uncertain() => Quality::Uncertain,
        _ => Quality::Good,
    };
    let value = match dv.value.as_ref() {
        Some(v) => match variant_to_json(v) {
            Some(json) => json,
            None => {
                warn!(point = %point_id, variant = ?v, "OPC UA 点位值类型暂不支持，跳过");
                return None;
            }
        },
        None => serde_json::Value::Null,
    };
    let timestamp = dv
        .source_timestamp
        .filter(|ts| !ts.is_null())
        .map(|ts| ts.as_chrono().timestamp_millis().max(0) as u64)
        .unwrap_or(now_ms);
    Some(Telemetry {
        point_id: point_id.to_string(),
        value,
        timestamp,
        quality,
    })
}

/// OPC UA 设备适配器。
///
/// 每个实例独占一个会话，由单个会话轮询任务持有（非线程共享）。
pub struct OpcuaAdapter {
    cfg: OpcConfig,
    session: Option<Arc<RwLock<Session>>>,
}

impl OpcuaAdapter {
    pub fn new(cfg: OpcConfig) -> Self {
        Self { cfg, session: None }
    }
}

#[async_trait]
impl DeviceAdapter for OpcuaAdapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        if self.session.is_some() {
            return Ok(());
        }
        let endpoint_url = self.cfg.endpoint.clone();
        let url_for_err = endpoint_url.clone();
        let session = tokio::task::spawn_blocking(move || -> Result<Arc<RwLock<Session>>, GatewayError> {
            let mut client = ClientBuilder::new()
                .application_name("ROC-WES Gateway")
                .application_uri("urn:roc-wes:gateway:opcua")
                .trust_server_certs(true)
                .session_retry_limit(0) // 重连交给网关引擎，库内不自行重试
                .client()
                .ok_or_else(|| GatewayError::Connect("OPC UA 客户端构造失败".to_string()))?;
            // 匿名 + SecurityPolicy None（与旧 Node 实现行为对齐）
            let endpoint: EndpointDescription = (
                endpoint_url.as_str(),
                "None",
                MessageSecurityMode::None,
                UserTokenPolicy::anonymous(),
            )
                .into();
            client
                .connect_to_endpoint(endpoint, IdentityToken::Anonymous)
                .map_err(|e| GatewayError::Connect(format!("连接 OPC UA 端点 {endpoint_url} 失败: {e}")))
        })
        .await
        .map_err(|e| GatewayError::Connect(format!("连接任务异常: {e}")))?
        .map_err(|e| GatewayError::Connect(format!("连接 OPC UA 端点 {url_for_err} 失败: {e}")))?;
        debug!(endpoint = %self.cfg.endpoint, "OPC UA 会话建立");
        self.session = Some(session);
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        if let Some(session) = self.session.take() {
            let _ = tokio::task::spawn_blocking(move || {
                let session = session.write();
                let _ = session.disconnect();
            })
            .await;
        }
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        let session_arc = self.session.clone().ok_or(GatewayError::NotConnected)?;
        let now_ms = now_millis();

        // 逐点解析；非法点位跳过并告警（不中断整轮轮询）
        let mut parsed: Vec<(String, NodeId)> = Vec::with_capacity(point_ids.len());
        for id in point_ids {
            match parse_node_id(id) {
                Ok(node_id) => parsed.push((id.clone(), node_id)),
                Err(e) => warn!(point = %id, error = %e, "跳过非法 OPC UA 点位 ID"),
            }
        }
        if parsed.is_empty() {
            return Ok(Vec::new());
        }

        let nodes_to_read: Vec<ReadValueId> = parsed
            .iter()
            .map(|(_, node_id)| ReadValueId {
                node_id: node_id.clone(),
                attribute_id: AttributeId::Value as u32,
                index_range: UAString::default(),
                data_encoding: QualifiedName::new(0, ""),
            })
            .collect();

        let results = tokio::task::spawn_blocking(move || -> Result<Vec<DataValue>, GatewayError> {
            let session = session_arc.read();
            session
                .read(&nodes_to_read, TimestampsToReturn::Source, 0.0)
                .map_err(|e| GatewayError::Read(format!("OPC UA 批量读失败: {e}")))
        })
        .await
        .map_err(|e| GatewayError::Read(format!("读取任务异常: {e}")))??;

        let mut samples: HashMap<String, Telemetry> = HashMap::new();
        for ((id, _), dv) in parsed.iter().zip(results.iter()) {
            if let Some(t) = data_value_to_telemetry(id, dv, now_ms) {
                samples.insert(id.clone(), t);
            }
        }

        // 按输入点位顺序输出
        Ok(point_ids.iter().filter_map(|id| samples.remove(id)).collect())
    }

    fn kind(&self) -> &'static str {
        "opc"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_string_node_ids() {
        let n = parse_node_id("ns=2;s=Channel1.Device1.Tag1").unwrap();
        assert_eq!(n.namespace, 2);
        assert!(n.is_string());
        let n = parse_node_id("ns=0;s=Server_ServerStatus").unwrap();
        assert_eq!(n.namespace, 0);
    }

    #[test]
    fn parse_numeric_node_ids() {
        let n = parse_node_id("ns=0;i=2258").unwrap();
        assert_eq!(n.namespace, 0);
        assert!(n.is_numeric());
        let n = parse_node_id("ns=3;i=1001").unwrap();
        assert_eq!(n.namespace, 3);
    }

    #[test]
    fn reject_invalid_node_ids() {
        assert!(parse_node_id("s=Tag1").is_err()); // 缺 ns 段（合同要求显式 ns）
        assert!(parse_node_id("ns=2;g=deadbeef").is_err()); // v1 仅支持 s/i
        assert!(parse_node_id("ns=2;b=Zm9v").is_err());
        assert!(parse_node_id("ns=2;s=").is_err()); // 空标识
        assert!(parse_node_id("ns=x;s=Tag1").is_err()); // ns 非数字
        assert!(parse_node_id("ns=2;i=1.5").is_err()); // i 非整数
        assert!(parse_node_id("ns=99999;s=Tag1").is_err()); // ns 越界
        assert!(parse_node_id("DB1,REAL0").is_err()); // S7 风格拒绝
        assert!(parse_node_id("").is_err());
    }

    #[test]
    fn variant_to_json_maps_types() {
        assert_eq!(variant_to_json(&Variant::Boolean(true)).unwrap(), serde_json::json!(true));
        assert_eq!(variant_to_json(&Variant::Int32(-5)).unwrap(), serde_json::json!(-5));
        assert_eq!(variant_to_json(&Variant::UInt64(42)).unwrap(), serde_json::json!(42));
        assert_eq!(variant_to_json(&Variant::Double(1.5)).unwrap(), serde_json::json!(1.5));
        assert_eq!(variant_to_json(&Variant::String("ok".into())).unwrap(), serde_json::json!("ok"));
        assert_eq!(variant_to_json(&Variant::Float(f32::NAN)), None); // 非有限浮点跳过
        assert_eq!(variant_to_json(&Variant::ByteString(ByteString::default())), None); // 未支持类型
    }

    #[test]
    fn bad_status_skips_point() {
        let dv = DataValue {
            value: Some(Variant::Int32(1)),
            status: Some(StatusCode::BadNodeIdUnknown),
            source_timestamp: None,
            source_picoseconds: None,
            server_timestamp: None,
            server_picoseconds: None,
        };
        assert!(data_value_to_telemetry("p", &dv, 0).is_none());
        let dv = DataValue {
            value: Some(Variant::Int32(1)),
            status: None,
            source_timestamp: None,
            source_picoseconds: None,
            server_timestamp: None,
            server_picoseconds: None,
        };
        let t = data_value_to_telemetry("p", &dv, 7).unwrap();
        assert_eq!(t.quality, Quality::Good);
        assert_eq!(t.timestamp, 7); // 无源时间戳回退本地时间
    }
}
