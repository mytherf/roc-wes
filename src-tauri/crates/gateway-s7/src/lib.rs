//! 西门子 S7 适配器（snap7-client，纯 Rust 异步 S7Comm 协议栈）
//!
//! 点位 ID 合同（nodes7 风格，与旧 Node 网关一致，见数据源手册 s7 §2）：
//! - DB：`DB{n},{TYPE}{off}`（REAL/LREAL/INT/WORD/DINT/DWORD/B）、位 `DB{n},X{字节}.{位}`
//! - M 区：`MB/MW/MD{off}`、位 `M{字节}.{位}`
//! - I/Q 区：`IB/IW/ID{off}` / `QB/QW/QD{off}`
//! v1 仅标量 + 位读；数组点（`DB1,REAL0.4`）返回 InvalidPoint。
//!
//! 读取策略：每轮点位构造 MultiReadItem 列表一次批量读（库内自动 PDU 分批）；
//! 批量失败时逐点降级读取以隔离单点故障，单点失败不影响其他点。

use async_trait::async_trait;
use gateway_core::{DeviceAdapter, GatewayError, Quality, S7Config, Telemetry};
use snap7_client::proto::s7::header::{Area as S7Area, TransportSize};
use snap7_client::transport::TcpTransport;
use snap7_client::{ConnectParams, MultiReadItem, S7Client};
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{debug, warn};

/// 数据区
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Area {
    Db,
    Merker,
    Input,
    Output,
}

/// 点位类型（决定字节数与解码方式）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Ty {
    Real,   // f32, 4B
    Lreal,  // f64, 8B
    Int,    // i16, 2B
    Word,   // u16, 2B
    Dint,   // i32, 4B
    Dword,  // u32, 4B
    Byte,   // u8, 1B
    Bool,   // 1 位
}

impl Ty {
    fn byte_size(self) -> u16 {
        match self {
            Ty::Real | Ty::Dint | Ty::Dword => 4,
            Ty::Lreal => 8,
            Ty::Int | Ty::Word => 2,
            Ty::Byte | Ty::Bool => 1,
        }
    }
}

/// 解析后的点位描述
#[derive(Debug, Clone, PartialEq, Eq)]
struct S7Point {
    area: Area,
    /// DB 号（仅 Area::Db 有效）
    db: u16,
    /// 字节偏移
    offset: u16,
    /// 位索引（仅 Ty::Bool 有效）
    bit: Option<u8>,
    ty: Ty,
}

impl S7Point {
    /// 构造 snap7-client 批量读条目（非 DB 区需手工构造结构体）
    fn to_multi_read_item(&self) -> MultiReadItem {
        let area = match self.area {
            Area::Db => return MultiReadItem::db(self.db, self.offset as u32, self.ty.byte_size()),
            Area::Merker => S7Area::Marker,
            Area::Input => S7Area::ProcessInput,
            Area::Output => S7Area::ProcessOutput,
        };
        MultiReadItem {
            area,
            db_number: 0,
            start: self.offset as u32,
            length: self.ty.byte_size(),
            transport: TransportSize::Byte,
        }
    }
}

fn invalid(point_id: &str) -> GatewayError {
    GatewayError::InvalidPoint(point_id.to_string())
}

/// 解析类型关键字（大小写不敏感），返回类型与剩余字符串
fn parse_type(rest: &str) -> Option<(Ty, &str)> {
    let upper = rest.to_ascii_uppercase();
    for (kw, ty) in [
        ("LREAL", Ty::Lreal),
        ("REAL", Ty::Real),
        ("DINT", Ty::Dint),
        ("DWORD", Ty::Dword),
        ("INT", Ty::Int),
        ("WORD", Ty::Word),
        ("BYTE", Ty::Byte),
        ("B", Ty::Byte),
    ] {
        if upper.starts_with(kw) {
            return Some((ty, &rest[kw.len()..]));
        }
    }
    None
}

/// 解析字节偏移（可选位索引 `.bit`）
fn parse_offset_bit(rest: &str) -> Option<(u16, Option<u8>)> {
    match rest.split_once('.') {
        Some((off_s, bit_s)) => {
            let off: u16 = off_s.parse().ok()?;
            let bit: u8 = bit_s.parse().ok()?;
            if bit > 7 {
                return None;
            }
            Some((off, Some(bit)))
        }
        None => Some((rest.parse().ok()?, None)),
    }
}

/// 解析 DB 点：`DB{n},{TYPE}{off}` 或位 `DB{n},X{字节}.{位}`（位号前 X 可省略）
fn parse_db(rest: &str, point_id: &str) -> Result<S7Point, GatewayError> {
    if rest.is_empty() {
        return Err(invalid(point_id));
    }
    let head = rest.chars().next().unwrap().to_ascii_uppercase();
    let tail = &rest[1..];
    // 位访问：X0.0 或 0.0（数字开头且含点）
    if head == 'X' || (head.is_ascii_digit() && rest.contains('.')) {
        let body = if head == 'X' { tail } else { rest };
        let (off, bit) = parse_offset_bit(body).ok_or_else(|| invalid(point_id))?;
        let bit = bit.ok_or_else(|| invalid(point_id))?;
        return Ok(S7Point { area: Area::Db, db: 0, offset: off, bit: Some(bit), ty: Ty::Bool });
    }
    // 类型化标量：TYPE{off}[.len]——带长度后缀为数组点，v1 不支持
    let (ty, after) = parse_type(rest).ok_or_else(|| invalid(point_id))?;
    if after.contains('.') {
        return Err(GatewayError::InvalidPoint(format!(
            "{point_id}（数组点暂不支持，v2 规划）"
        )));
    }
    let offset: u16 = after.parse().map_err(|_| invalid(point_id))?;
    Ok(S7Point { area: Area::Db, db: 0, offset, bit: None, ty })
}

/// 解析 M/I/Q 区点：`MB/MW/MD{off}`、`IB/IW/ID{off}`、`QB/QW/QD{off}`、位 `M{字节}.{位}`
fn parse_io(prefix: char, rest: &str, point_id: &str) -> Result<S7Point, GatewayError> {
    let area = match prefix {
        'M' => Area::Merker,
        'I' => Area::Input,
        _ => Area::Output,
    };
    if rest.is_empty() {
        return Err(invalid(point_id));
    }
    let head = rest.chars().next().unwrap().to_ascii_uppercase();
    // 位访问：M0.0 / MX0.0（X 可省略）
    if head == 'X' || rest.contains('.') {
        let body = if head == 'X' { &rest[1..] } else { rest };
        let (off, bit) = parse_offset_bit(body).ok_or_else(|| invalid(point_id))?;
        let bit = bit.ok_or_else(|| invalid(point_id))?;
        return Ok(S7Point { area, db: 0, offset: off, bit: Some(bit), ty: Ty::Bool });
    }
    // 字节/字/双字：B/W/D 后缀
    let (suffix, num) = rest.split_at(1);
    let ty = match suffix.to_ascii_uppercase().as_str() {
        "B" => Ty::Byte,
        "W" => Ty::Word,
        "D" => Ty::Dword,
        _ => return Err(invalid(point_id)),
    };
    let offset: u16 = num.parse().map_err(|_| invalid(point_id))?;
    Ok(S7Point { area, db: 0, offset, bit: None, ty })
}

/// 解析 nodes7 风格点 ID
fn parse_point(point_id: &str) -> Result<S7Point, GatewayError> {
    let upper = point_id.to_ascii_uppercase();
    if upper.starts_with("DB") {
        let rest = &point_id[2..];
        let (num_s, tail) = rest
            .split_once(',')
            .ok_or_else(|| invalid(point_id))?;
        let db: u16 = num_s.parse().map_err(|_| invalid(point_id))?;
        let mut p = parse_db(tail, point_id)?;
        p.db = db;
        return Ok(p);
    }
    let prefix = upper.chars().next().ok_or_else(|| invalid(point_id))?;
    if matches!(prefix, 'M' | 'I' | 'Q') {
        return parse_io(prefix, &point_id[1..], point_id);
    }
    Err(invalid(point_id))
}

/// 大端字节解码为 JSON 值
fn decode(ty: Ty, bit: Option<u8>, bytes: &[u8]) -> Result<serde_json::Value, String> {
    if bytes.len() < ty.byte_size() as usize {
        return Err(format!("读取字节数不足：期望 {} 实得 {}", ty.byte_size(), bytes.len()));
    }
    Ok(match ty {
        Ty::Real => serde_json::Value::from(f32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])),
        Ty::Lreal => serde_json::Value::from(f64::from_be_bytes(bytes[..8].try_into().unwrap())),
        Ty::Int => serde_json::Value::from(i16::from_be_bytes([bytes[0], bytes[1]])),
        Ty::Word => serde_json::Value::from(u16::from_be_bytes([bytes[0], bytes[1]])),
        Ty::Dint => serde_json::Value::from(i32::from_be_bytes(bytes[..4].try_into().unwrap())),
        Ty::Dword => serde_json::Value::from(u32::from_be_bytes(bytes[..4].try_into().unwrap())),
        Ty::Byte => serde_json::Value::from(bytes[0]),
        Ty::Bool => {
            let b = bit.ok_or_else(|| "位点缺少位索引".to_string())?;
            serde_json::Value::from((bytes[0] >> b) & 1 == 1)
        }
    })
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 西门子 S7 设备适配器。
///
/// 每个实例独占一个 PLC 连接，由单个会话轮询任务持有（非线程共享）。
pub struct S7Adapter {
    cfg: S7Config,
    client: Option<S7Client<TcpTransport>>,
}

impl S7Adapter {
    pub fn new(cfg: S7Config) -> Self {
        Self { cfg, client: None }
    }

    /// 单点读取（批量失败后的降级路径，隔离单点故障）
    async fn read_one(
        client: &S7Client<TcpTransport>,
        point: &S7Point,
    ) -> Result<Vec<u8>, GatewayError> {
        let res = match point.area {
            Area::Db => client
                .db_read(point.db, point.offset as u32, point.ty.byte_size())
                .await
                .map_err(|e| GatewayError::Read(format!("DB{} 读取失败: {e}", point.db))),
            Area::Merker => client
                .mb_read(point.offset as u32, point.ty.byte_size())
                .await
                .map_err(|e| GatewayError::Read(format!("M 区读取失败: {e}"))),
            Area::Input => client
                .eb_read(point.offset as u32, point.ty.byte_size())
                .await
                .map_err(|e| GatewayError::Read(format!("I 区读取失败: {e}"))),
            Area::Output => client
                .ib_read(point.offset as u32, point.ty.byte_size())
                .await
                .map_err(|e| GatewayError::Read(format!("Q 区读取失败: {e}"))),
        }?;
        Ok(res.to_vec())
    }
}

#[async_trait]
impl DeviceAdapter for S7Adapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        if self.client.is_some() {
            return Ok(());
        }
        let mut addrs = tokio::net::lookup_host((self.cfg.host.as_str(), self.cfg.port))
            .await
            .map_err(|e| {
                GatewayError::Connect(format!("地址解析失败 {}:{}: {e}", self.cfg.host, self.cfg.port))
            })?;
        let socket_addr = addrs
            .next()
            .ok_or_else(|| GatewayError::Connect(format!("{}:{} 未解析到地址", self.cfg.host, self.cfg.port)))?;
        let params = ConnectParams {
            rack: self.cfg.rack,
            slot: self.cfg.slot,
            connect_timeout: Duration::from_secs(5),
            ..Default::default()
        };
        let client = S7Client::<TcpTransport>::connect(socket_addr, params)
            .await
            .map_err(|e| {
                GatewayError::Connect(format!(
                    "连接 {}:{} (rack={} slot={}) 失败: {e}",
                    socket_addr.ip(),
                    socket_addr.port(),
                    self.cfg.rack,
                    self.cfg.slot
                ))
            })?;
        debug!(host = %self.cfg.host, port = self.cfg.port, "S7 连接建立");
        self.client = Some(client);
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        // S7Client 无显式 close：丢弃即关闭 TCP 连接
        self.client = None;
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        let client = self.client.as_mut().ok_or(GatewayError::NotConnected)?;
        let now_ms = now_millis();

        // 逐点解析；非法点位跳过并告警（不中断整轮轮询）
        let mut parsed: Vec<(String, S7Point)> = Vec::with_capacity(point_ids.len());
        for id in point_ids {
            match parse_point(id) {
                Ok(p) => parsed.push((id.clone(), p)),
                Err(e) => warn!(point = %id, error = %e, "跳过非法 S7 点位 ID"),
            }
        }
        if parsed.is_empty() {
            return Ok(Vec::new());
        }

        let items: Vec<MultiReadItem> = parsed.iter().map(|(_, p)| p.to_multi_read_item()).collect();
        let mut samples: HashMap<String, Telemetry> = HashMap::new();

        match client.read_multi_vars(&items).await {
            Ok(results) => {
                for ((id, point), bytes) in parsed.iter().zip(results.into_iter()) {
                    match decode(point.ty, point.bit, &bytes) {
                        Ok(value) => {
                            samples.insert(
                                id.clone(),
                                Telemetry {
                                    point_id: id.clone(),
                                    value,
                                    timestamp: now_ms,
                                    quality: Quality::Good,
                                },
                            );
                        }
                        Err(e) => warn!(point = %id, error = %e, "S7 点位解码失败"),
                    }
                }
            }
            Err(e) => {
                // 批量读失败（连接故障等）：先逐点降级以隔离单点问题，
                // 若首个点仍失败则判定为连接级故障触发引擎重连
                debug!(error = %e, "S7 批量读失败，降级为逐点读取");
                let mut first = true;
                for (id, point) in &parsed {
                    match Self::read_one(client, point).await {
                        Ok(bytes) => {
                            if let Ok(value) = decode(point.ty, point.bit, &bytes) {
                                samples.insert(
                                    id.clone(),
                                    Telemetry {
                                        point_id: id.clone(),
                                        value,
                                        timestamp: now_ms,
                                        quality: Quality::Good,
                                    },
                                );
                            }
                        }
                        Err(e) => {
                            if first {
                                return Err(e);
                            }
                            warn!(point = %id, error = %e, "S7 点位读取失败");
                        }
                    }
                    first = false;
                }
            }
        }

        // 按输入点位顺序输出
        Ok(point_ids.iter().filter_map(|id| samples.remove(id)).collect())
    }

    fn kind(&self) -> &'static str {
        "s7"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_db_typed_points() {
        let p = parse_point("DB1,REAL0").unwrap();
        assert_eq!((p.area, p.db, p.offset, p.ty), (Area::Db, 1, 0, Ty::Real));
        let p = parse_point("DB2,INT4").unwrap();
        assert_eq!((p.db, p.offset, p.ty), (2, 4, Ty::Int));
        let p = parse_point("DB3,WORD6").unwrap();
        assert_eq!(p.ty, Ty::Word);
        let p = parse_point("DB4,DINT8").unwrap();
        assert_eq!(p.ty, Ty::Dint);
        let p = parse_point("DB5,DWORD8").unwrap();
        assert_eq!(p.ty, Ty::Dword);
        let p = parse_point("DB6,B10").unwrap();
        assert_eq!(p.ty, Ty::Byte);
        let p = parse_point("db7,lreal16").unwrap();
        assert_eq!((p.db, p.offset, p.ty), (7, 16, Ty::Lreal));
    }

    #[test]
    fn parse_db_bit_points() {
        let p = parse_point("DB1,X0.0").unwrap();
        assert_eq!((p.ty, p.offset, p.bit), (Ty::Bool, 0, Some(0)));
        let p = parse_point("DB1,332.0").unwrap();
        assert_eq!((p.offset, p.bit), (332, Some(0)));
        let p = parse_point("DB70,332.7").unwrap();
        assert_eq!(p.bit, Some(7));
    }

    #[test]
    fn parse_io_points() {
        assert_eq!(parse_point("MB0").unwrap().ty, Ty::Byte);
        assert_eq!(parse_point("MW20").unwrap().ty, Ty::Word);
        assert_eq!(parse_point("MD4").unwrap().ty, Ty::Dword);
        assert_eq!(parse_point("IB0").unwrap().area, Area::Input);
        assert_eq!(parse_point("QW2").unwrap().area, Area::Output);
        let p = parse_point("M0.0").unwrap();
        assert_eq!((p.area, p.ty, p.bit), (Area::Merker, Ty::Bool, Some(0)));
        let p = parse_point("M10.3").unwrap();
        assert_eq!((p.offset, p.bit), (10, Some(3)));
    }

    #[test]
    fn reject_invalid_points() {
        assert!(parse_point("DB1").is_err()); // 缺类型段
        assert!(parse_point("DB1,REAL").is_err()); // 缺偏移
        assert!(parse_point("DB1,REAL0.4").is_err()); // 数组点 v1 不支持
        assert!(parse_point("DB1,X0").is_err()); // 位点缺位号
        assert!(parse_point("DB1,X0.9").is_err()); // 位号越界
        assert!(parse_point("MB").is_err());
        assert!(parse_point("MR0").is_err());
        assert!(parse_point("holding:0").is_err()); // Modbus 风格拒绝
        assert!(parse_point("").is_err());
        assert!(parse_point("DB99999,REAL0").is_err()); // DB 号越界
    }

    #[test]
    fn decode_big_endian_values() {
        assert_eq!(decode(Ty::Int, None, &[0xFF, 0xFE]).unwrap(), serde_json::json!(-2));
        assert_eq!(decode(Ty::Word, None, &[0x01, 0x02]).unwrap(), serde_json::json!(258));
        assert_eq!(decode(Ty::Dint, None, &[0xFF, 0xFF, 0xFF, 0xFC]).unwrap(), serde_json::json!(-4));
        assert_eq!(decode(Ty::Dword, None, &[0, 0, 1, 0]).unwrap(), serde_json::json!(256));
        assert_eq!(decode(Ty::Byte, None, &[0xAB]).unwrap(), serde_json::json!(171));
        assert_eq!(decode(Ty::Real, None, &1.5f32.to_be_bytes()).unwrap(), serde_json::json!(1.5));
        assert_eq!(decode(Ty::Bool, Some(3), &[0b0000_1000]).unwrap(), serde_json::json!(true));
        assert_eq!(decode(Ty::Bool, Some(0), &[0b0000_1000]).unwrap(), serde_json::json!(false));
        assert!(decode(Ty::Real, None, &[0, 0]).is_err()); // 字节不足
    }
}
