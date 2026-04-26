pub mod clock;
pub mod discovery;
pub mod session;
pub mod signaling;
pub mod streaming;
pub mod transcoder;

use std::net::SocketAddr;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Status returned to the frontend via `iem_status()`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IemStatus {
    pub running: bool,
    pub ws_port: Option<u16>,
    pub server_ip: Option<String>,
    pub connected_clients: u32,
}

/// Description of a single audio stem sent to clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StemInfo {
    pub id: String,
    pub label: String,
    pub ssrc: u32,
}

/// Internal playback state tracked by the IEM server.
#[derive(Debug, Clone)]
pub enum PlaybackState {
    Stopped,
    Playing {
        file_hash: String,
        start_position_ms: u64,
        started_at_us: i64,
    },
    Paused {
        file_hash: String,
        position_ms: u64,
    },
}

/// Commands sent from the synchronous Tauri thread to the async IEM runtime.
pub enum Command {
    Play {
        file_hash: String,
        position_ms: u64,
        reply: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
    Pause {
        reply: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
    StopPlayback {
        reply: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
    Shutdown,
}

/// Stem label derived from the stem id.
pub fn stem_label(id: &str) -> &'static str {
    match id {
        "instrumental" => "Instrumental",
        "vocals" => "Guide Vocal",
        "male_vocals" => "Male Vocal",
        "female_vocals" => "Female Vocal",
        _ => "Unknown",
    }
}

/// Detect the LAN IPv4 address by asking the OS which interface routes to the internet.
pub fn detect_lan_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()? {
        SocketAddr::V4(addr) => Some(addr.ip().to_string()),
        _ => None,
    }
}

/// Microsecond wall-clock timestamp (since UNIX epoch).
pub fn now_us() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as i64
}
