//! 四种 Web 协议适配器共用的解析与缓冲工具

use gateway_core::{Quality, Telemetry};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

/// 点位最新值缓冲：point_id → 未读遥测样本（read 时排空，只保留最新一帧）
pub type SampleBuffer = Arc<Mutex<HashMap<String, Telemetry>>>;

/// 创建空缓冲
pub fn new_buffer() -> SampleBuffer {
    Arc::new(Mutex::new(HashMap::new()))
}

/// 当前 Unix 毫秒时间戳
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 解析服务端推送的 JSON 帧为遥测。
///
/// 字段识别规则与旧前端服务（WebSocketService / HttpPollingService / SseService / MqttService）一致：
/// - 点ID 优先级：`topic` → `id` → `pointId`，三者皆无时使用 `fallback_point_id`（http/sse/mqtt 按点位建流时传入）；
/// - 数值优先级：`value` → `data`，两者皆无时使用 `fallback_value`（MQTT 传整个 JSON，兼容裸值发布）；
/// - `timestamp`（毫秒）缺省取当前时间；`quality` 缺省取 Good。
pub fn parse_frame(
    json: &Value,
    fallback_point_id: Option<&str>,
    fallback_value: Option<&Value>,
) -> Option<Telemetry> {
    let point_id = json
        .get("topic")
        .or_else(|| json.get("id"))
        .or_else(|| json.get("pointId"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| fallback_point_id.map(str::to_string))?;
    let value = json
        .get("value")
        .or_else(|| json.get("data"))
        .cloned()
        .or_else(|| fallback_value.cloned())
        .unwrap_or(Value::Null);
    let timestamp = json
        .get("timestamp")
        .and_then(|v| v.as_u64())
        .unwrap_or_else(now_ms);
    let quality = json
        .get("quality")
        .and_then(|v| v.as_str())
        .map(parse_quality)
        .unwrap_or(Quality::Good);
    Some(Telemetry {
        point_id,
        value,
        timestamp,
        quality,
    })
}

/// 质量字符串 → Quality（未知值按 Good 处理）
fn parse_quality(s: &str) -> Quality {
    match s {
        "bad" => Quality::Bad,
        "uncertain" => Quality::Uncertain,
        _ => Quality::Good,
    }
}

/// 为 URL 追加查询参数（URL 已有 `?` 时用 `&` 续接）
pub fn append_query(url: &str, param: &str) -> String {
    let sep = if url.contains('?') { "&" } else { "?" };
    format!("{url}{sep}{param}")
}

/// 判断 MQTT 具体主题（topic）是否匹配订阅过滤器（filter），支持通配符：
/// - `+` 匹配单个层级（如 `sensors/+/temp` 匹配 `sensors/1/temp`）
/// - `#` 匹配剩余全部层级（如 `sensors/#` 匹配 `sensors/1/temp`）
/// 不含通配符时退化为精确匹配（移植自旧前端 MqttService.topicMatches）。
pub fn topic_matches(filter: &str, topic: &str) -> bool {
    if filter == topic {
        return true;
    }
    if !filter.contains('+') && !filter.contains('#') {
        return false;
    }
    let f: Vec<&str> = filter.split('/').collect();
    let t: Vec<&str> = topic.split('/').collect();
    for (i, seg) in f.iter().enumerate() {
        if *seg == "#" {
            return true; // # 匹配剩余全部层级（含零层）
        }
        if *seg == "+" {
            if i >= t.len() {
                return false; // 主题层级不足
            }
            continue; // + 匹配当前任意单层
        }
        if t.get(i) != Some(seg) {
            return false; // 普通层级不相等
        }
    }
    f.len() == t.len() // 层级数必须一致
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_frame_prefers_topic_then_id_then_point_id() {
        let t = parse_frame(&json!({"topic": "a", "id": "b", "pointId": "c", "value": 1}), None, None)
            .unwrap();
        assert_eq!(t.point_id, "a");
        let t = parse_frame(&json!({"id": "b", "pointId": "c", "value": 1}), None, None).unwrap();
        assert_eq!(t.point_id, "b");
        let t = parse_frame(&json!({"pointId": "c", "value": 1}), None, None).unwrap();
        assert_eq!(t.point_id, "c");
    }

    #[test]
    fn parse_frame_value_prefers_value_then_data_then_fallback() {
        let t = parse_frame(&json!({"topic": "a", "value": 1, "data": 2}), None, None).unwrap();
        assert_eq!(t.value, json!(1));
        let t = parse_frame(&json!({"topic": "a", "data": 2}), None, None).unwrap();
        assert_eq!(t.value, json!(2));
        let whole = json!({"raw": true});
        let t = parse_frame(&json!({}), Some("p"), Some(&whole)).unwrap();
        assert_eq!(t.point_id, "p");
        assert_eq!(t.value, whole);
    }

    #[test]
    fn parse_frame_defaults_timestamp_and_quality() {
        let before = now_ms();
        let t = parse_frame(&json!({"topic": "a", "value": 1}), None, None).unwrap();
        assert!(t.timestamp >= before);
        assert_eq!(t.quality, Quality::Good);
        let t = parse_frame(
            &json!({"topic": "a", "value": 1, "timestamp": 123u64, "quality": "bad"}),
            None,
            None,
        )
        .unwrap();
        assert_eq!(t.timestamp, 123);
        assert_eq!(t.quality, Quality::Bad);
    }

    #[test]
    fn parse_frame_requires_point_id() {
        assert!(parse_frame(&json!({"value": 1}), None, None).is_none());
        assert!(parse_frame(&json!({"value": 1}), Some("fb"), None).is_some());
    }

    #[test]
    fn append_query_handles_existing_question_mark() {
        assert_eq!(append_query("http://h/x", "pointId=a"), "http://h/x?pointId=a");
        assert_eq!(append_query("http://h/x?k=1", "pointId=a"), "http://h/x?k=1&pointId=a");
    }

    #[test]
    fn topic_matches_exact_and_wildcards() {
        // 精确匹配
        assert!(topic_matches("sensors/temp", "sensors/temp"));
        assert!(!topic_matches("sensors/temp", "sensors/humi"));
        // + 单层通配
        assert!(topic_matches("sensors/+/temp", "sensors/1/temp"));
        assert!(!topic_matches("sensors/+/temp", "sensors/temp"));
        assert!(!topic_matches("sensors/+", "sensors/1/temp"));
        // # 多层通配
        assert!(topic_matches("sensors/#", "sensors/1/temp"));
        assert!(topic_matches("sensors/#", "sensors"));
        assert!(topic_matches("#", "any/topic/here"));
    }
}
