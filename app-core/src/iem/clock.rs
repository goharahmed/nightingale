use futures_util::SinkExt;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, warn};

use super::session::WsSender;

/// Run NTP-style clock synchronization with a client over WebSocket.
/// Performs `rounds` exchanges and returns the median clock offset in microseconds.
pub async fn run_clock_sync(ws: &mut WsSender, rx: &mut tokio::sync::mpsc::Receiver<serde_json::Value>, rounds: usize) -> Result<i64, String> {
    let mut offsets = Vec::with_capacity(rounds);

    for i in 0..rounds {
        let server_time_us = super::now_us();
        let req = serde_json::json!({
            "type": "clock_sync_request",
            "server_time_us": server_time_us,
        });
        ws.send(Message::Text(req.to_string().into()))
            .await
            .map_err(|e| format!("clock sync send failed: {e}"))?;

        let resp = tokio::time::timeout(std::time::Duration::from_secs(5), rx.recv())
            .await
            .map_err(|_| "clock sync response timeout".to_string())?
            .ok_or_else(|| "client disconnected during clock sync".to_string())?;

        if resp.get("type").and_then(|v| v.as_str()) != Some("clock_sync_response") {
            warn!("unexpected message during clock sync round {i}: {resp}");
            continue;
        }

        let orig_server_us = resp
            .get("server_time_us")
            .and_then(|v| v.as_i64())
            .ok_or("missing server_time_us in clock_sync_response")?;
        let client_us = resp
            .get("client_time_us")
            .and_then(|v| v.as_i64())
            .ok_or("missing client_time_us in clock_sync_response")?;

        let now = super::now_us();
        let rtt = now - orig_server_us;
        let one_way = rtt / 2;
        let offset = client_us - (orig_server_us + one_way);
        offsets.push(offset);
        debug!("clock sync round {i}: rtt={rtt}μs offset={offset}μs");
    }

    if offsets.is_empty() {
        return Err("no successful clock sync exchanges".to_string());
    }

    offsets.sort();
    let median = offsets[offsets.len() / 2];
    debug!("clock sync complete: median offset = {median}μs ({} rounds)", offsets.len());
    Ok(median)
}

/// Build an RTCP Sender Report packet.
///
/// Layout (28 bytes):
///   - V=2, P=0, RC=0, PT=200 (SR), length=6 (words-1)
///   - SSRC
///   - NTP timestamp (64-bit: seconds + fraction)
///   - RTP timestamp
///   - Sender packet count
///   - Sender octet count
pub fn build_sender_report(
    ssrc: u32,
    ntp_secs: u32,
    ntp_frac: u32,
    rtp_ts: u32,
    packet_count: u32,
    octet_count: u32,
) -> [u8; 28] {
    let mut buf = [0u8; 28];
    // V=2, P=0, RC=0
    buf[0] = 0x80;
    // PT=200 (Sender Report)
    buf[1] = 200;
    // Length in 32-bit words minus one = 6
    buf[2..4].copy_from_slice(&6u16.to_be_bytes());
    buf[4..8].copy_from_slice(&ssrc.to_be_bytes());
    buf[8..12].copy_from_slice(&ntp_secs.to_be_bytes());
    buf[12..16].copy_from_slice(&ntp_frac.to_be_bytes());
    buf[16..20].copy_from_slice(&rtp_ts.to_be_bytes());
    buf[20..24].copy_from_slice(&packet_count.to_be_bytes());
    buf[24..28].copy_from_slice(&octet_count.to_be_bytes());
    buf
}
