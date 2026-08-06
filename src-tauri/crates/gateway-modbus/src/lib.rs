//! Modbus TCP 适配器（tokio-modbus 0.13）
//!
//! 点位 ID 约定（与旧 Node 网关一致）：
//! `holding:N` / `input:N` / `coil:N` / `discrete:N`，N 为 0 基寄存器/线圈地址。
//!
//! 性能优化：同一存储区内按地址排序并合并连续段，
//! 每个轮询周期每段只发一次 Modbus 请求（而非每点一次）。

use async_trait::async_trait;
use gateway_core::{DeviceAdapter, GatewayError, ModbusConfig, Quality, Telemetry};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio_modbus::client::tcp::connect_slave;
use tokio_modbus::client::{Context, Reader};
use tokio_modbus::Slave;
use tracing::warn;

/// 单次 Modbus 请求可读寄存器上限（协议规定 125）
const MAX_REGS_PER_READ: u16 = 125;
/// 单次 Modbus 请求可读位（线圈/离散输入）上限（保守值）
const MAX_BITS_PER_READ: u16 = 1900;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Area {
    Holding,
    Input,
    Coil,
    Discrete,
}

impl Area {
    fn max_quantity(self) -> u16 {
        match self {
            Area::Holding | Area::Input => MAX_REGS_PER_READ,
            Area::Coil | Area::Discrete => MAX_BITS_PER_READ,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Area::Holding => "holding",
            Area::Input => "input",
            Area::Coil => "coil",
            Area::Discrete => "discrete",
        }
    }
}

/// Modbus TCP 设备适配器。
///
/// 每个实例独占一个设备连接，由单个会话轮询任务持有（非线程共享）。
pub struct ModbusAdapter {
    cfg: ModbusConfig,
    ctx: Option<Context>,
}

impl ModbusAdapter {
    pub fn new(cfg: ModbusConfig) -> Self {
        Self { cfg, ctx: None }
    }
}

fn parse_point(point_id: &str) -> Result<(Area, u16), GatewayError> {
    let (prefix, num) = point_id
        .split_once(':')
        .ok_or_else(|| GatewayError::InvalidPoint(point_id.to_string()))?;
    let area = match prefix {
        "holding" => Area::Holding,
        "input" => Area::Input,
        "coil" => Area::Coil,
        "discrete" => Area::Discrete,
        _ => return Err(GatewayError::InvalidPoint(point_id.to_string())),
    };
    let addr: u16 = num
        .parse()
        .map_err(|_| GatewayError::InvalidPoint(point_id.to_string()))?;
    Ok((area, addr))
}

/// 将 (地址, 点位) 列表按地址排序后合并为连续读取段：
/// 返回 (起始地址, 数量, 段内成员) 列表
fn merge_ranges(points: &mut [(u16, String)], max_qty: u16) -> Vec<(u16, u16, Vec<(u16, String)>)> {
    points.sort_by_key(|(addr, _)| *addr);
    let mut ranges: Vec<(u16, u16, Vec<(u16, String)>)> = Vec::new();
    for (addr, id) in points.iter().cloned() {
        if let Some((start, len, members)) = ranges.last_mut() {
            if addr == *start + *len && *len < max_qty {
                members.push((addr, id));
                *len += 1;
                continue;
            }
        }
        ranges.push((addr, 1, vec![(addr, id)]));
    }
    ranges
}

fn words_to_values(res: tokio_modbus::Result<Vec<u16>>) -> Result<Vec<serde_json::Value>, GatewayError> {
    let words = res.map_err(|e| GatewayError::Read(e.to_string()))?;
    Ok(words.into_iter().map(serde_json::Value::from).collect())
}

fn coils_to_values(res: tokio_modbus::Result<Vec<bool>>) -> Result<Vec<serde_json::Value>, GatewayError> {
    let coils = res.map_err(|e| GatewayError::Read(e.to_string()))?;
    Ok(coils.into_iter().map(serde_json::Value::from).collect())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[async_trait]
impl DeviceAdapter for ModbusAdapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        if self.ctx.is_some() {
            return Ok(());
        }
        let mut addrs = tokio::net::lookup_host((self.cfg.host.as_str(), self.cfg.port))
            .await
            .map_err(|e| GatewayError::Connect(format!("地址解析失败 {}:{}: {e}", self.cfg.host, self.cfg.port)))?;
        let socket_addr: SocketAddr = addrs
            .next()
            .ok_or_else(|| GatewayError::Connect(format!("{}:{} 未解析到地址", self.cfg.host, self.cfg.port)))?;
        let ctx = connect_slave(socket_addr, Slave(self.cfg.unit_id))
            .await
            .map_err(|e| {
                GatewayError::Connect(format!(
                    "连接 {}:{} (unitId={}) 失败: {e}",
                    socket_addr.ip(),
                    socket_addr.port(),
                    self.cfg.unit_id
                ))
            })?;
        self.ctx = Some(ctx);
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        // Context 无显式 close：丢弃即关闭 TCP 连接
        self.ctx = None;
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        let ctx = self.ctx.as_mut().ok_or(GatewayError::NotConnected)?;
        let now_ms = now_millis();

        // 按存储区分组；非法点位 ID 跳过并告警（不中断整轮轮询）
        let mut by_area: HashMap<Area, Vec<(u16, String)>> = HashMap::new();
        for id in point_ids {
            match parse_point(id) {
                Ok((area, addr)) => by_area.entry(area).or_default().push((addr, id.clone())),
                Err(e) => warn!(point = %id, error = %e, "跳过非法 Modbus 点位 ID"),
            }
        }

        let mut samples: HashMap<String, Telemetry> = HashMap::new();
        for (area, mut points) in by_area {
            for (start, len, members) in merge_ranges(&mut points, area.max_quantity()) {
                let values = match area {
                    Area::Holding => words_to_values(ctx.read_holding_registers(start, len).await),
                    Area::Input => words_to_values(ctx.read_input_registers(start, len).await),
                    Area::Coil => coils_to_values(ctx.read_coils(start, len).await),
                    Area::Discrete => coils_to_values(ctx.read_discrete_inputs(start, len).await),
                }
                .map_err(|e| GatewayError::Read(format!("{} 区 start={start} len={len}: {e}", area.label())))?;

                for (i, (_addr, id)) in members.iter().enumerate() {
                    let value = values.get(i).cloned().unwrap_or(serde_json::Value::Null);
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
        }

        // 按输入点位顺序输出
        Ok(point_ids.iter().filter_map(|id| samples.remove(id)).collect())
    }

    fn kind(&self) -> &'static str {
        "modbus"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_points() {
        assert_eq!(parse_point("holding:0").unwrap().0, Area::Holding);
        assert_eq!(parse_point("input:12").unwrap().1, 12);
        assert_eq!(parse_point("coil:100").unwrap().0, Area::Coil);
        assert_eq!(parse_point("discrete:7").unwrap().0, Area::Discrete);
    }

    #[test]
    fn reject_invalid_points() {
        assert!(parse_point("holding").is_err());
        assert!(parse_point("db1.dbw0").is_err());
        assert!(parse_point("holding:abc").is_err());
        assert!(parse_point("holding:99999999").is_err());
    }

    #[test]
    fn merges_contiguous_ranges() {
        let mut pts = vec![
            (3, "holding:3".to_string()),
            (1, "holding:1".to_string()),
            (2, "holding:2".to_string()),
            (10, "holding:10".to_string()),
        ];
        let ranges = merge_ranges(&mut pts, 125);
        assert_eq!(ranges.len(), 2);
        assert_eq!((ranges[0].0, ranges[0].1), (1, 3)); // 1..=3 合并
        assert_eq!((ranges[1].0, ranges[1].1), (10, 1));
    }

    #[test]
    fn splits_range_at_max_quantity() {
        let mut pts: Vec<(u16, String)> = (0..130).map(|i| (i, format!("holding:{i}"))).collect();
        let ranges = merge_ranges(&mut pts, 125);
        assert_eq!(ranges.len(), 2);
        assert_eq!(ranges[0].1, 125);
        assert_eq!(ranges[1].1, 5);
    }
}
