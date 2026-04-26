use std::net::SocketAddr;
use std::time::Instant;

use futures_util::stream::SplitSink;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

pub type WsSender = SplitSink<WebSocketStream<TcpStream>, Message>;

/// Server-side state for a single connected IEM client.
pub struct IemSession {
    pub session_id: String,
    pub client_addr: SocketAddr,
    pub rtp_port: u16,
    pub clock_offset_us: i64,
    pub connected_at: Instant,
    pub ws_sender: WsSender,
}

impl IemSession {
    pub fn rtp_addr(&self) -> SocketAddr {
        SocketAddr::new(self.client_addr.ip(), self.rtp_port)
    }
}
