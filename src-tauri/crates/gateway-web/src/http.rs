//! HTTP 轮询适配器：按点位 GET 查询最新值
//!
//! 语义与旧前端 HttpPollingService 一致：对每个点发起
//! `GET ${url}?pointId=xxx`，服务端返回 `{ id, value, timestamp, quality }` 结构
//! （兼容 value/data 字段）。无后台任务——轮询节奏由引擎 tick 驱动。

use crate::common::{append_query, parse_frame};
use async_trait::async_trait;
use gateway_core::{DeviceAdapter, GatewayError, HttpConfig, Telemetry};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use std::time::Duration;
use tracing::warn;

pub struct HttpAdapter {
    url: String,
    /// HTTP 客户端（connect 时创建；带超时防止单次请求挂死阻塞会话轮询）
    client: Option<reqwest::Client>,
}

impl HttpAdapter {
    pub fn new(config: HttpConfig) -> Self {
        Self {
            url: config.url,
            client: None,
        }
    }
}

#[async_trait]
impl DeviceAdapter for HttpAdapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| GatewayError::Connect(e.to_string()))?;
        self.client = Some(client);
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        self.client = None;
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        let client = self.client.as_ref().ok_or(GatewayError::NotConnected)?;
        let mut out = Vec::new();
        let mut failed = 0usize;
        for id in point_ids {
            let encoded = utf8_percent_encode(id, NON_ALPHANUMERIC);
            let url = append_query(&self.url, &format!("pointId={encoded}"));
            match client.get(url).send().await {
                Ok(resp) if resp.status().is_success() => match resp.json::<serde_json::Value>().await {
                    Ok(v) => {
                        if let Some(t) = parse_frame(&v, Some(id), None) {
                            out.push(t);
                        }
                    }
                    Err(e) => {
                        failed += 1;
                        warn!(point = %id, error = %e, "HTTP 响应解析失败");
                    }
                },
                Ok(resp) => {
                    failed += 1;
                    warn!(point = %id, status = %resp.status(), "HTTP 请求返回非成功状态");
                }
                Err(e) => {
                    failed += 1;
                    warn!(point = %id, error = %e, "HTTP 请求失败");
                }
            }
        }
        // 全部点位失败视为服务不可达 → 报错触发引擎退避重连；
        // 部分失败仅丢失该点本轮数据（下一 tick 再试），与旧前端行为一致
        if failed > 0 && out.is_empty() {
            return Err(GatewayError::Read(format!(
                "HTTP 请求失败（{failed} 个点位无响应）"
            )));
        }
        Ok(out)
    }

    fn kind(&self) -> &'static str {
        "http"
    }
}
