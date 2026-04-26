use std::sync::Mutex;

use tokio::sync::{broadcast, mpsc, oneshot};
use tracing::{info, warn};

use crate::iem::{self, Command, IemStatus};
use crate::iem::discovery::MdnsAdvertiser;

/// Handle to the running IEM server, held in a global static.
struct IemHandle {
    cmd_tx: mpsc::UnboundedSender<Command>,
    shutdown_tx: broadcast::Sender<()>,
    ws_port: u16,
    server_ip: String,
    _mdns: Option<MdnsAdvertiser>,
    _runtime: tokio::runtime::Runtime,
}

static IEM_HANDLE: Mutex<Option<IemHandle>> = Mutex::new(None);

/// Start the IEM server (WebSocket + mDNS + RTP). Returns the server status.
pub fn start() -> Result<IemStatus, String> {
    let mut guard = IEM_HANDLE.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = guard.as_ref() {
        return Ok(IemStatus {
            running: true,
            ws_port: Some(handle.ws_port),
            server_ip: Some(handle.server_ip.clone()),
            connected_clients: 0,
        });
    }

    let server_ip = iem::detect_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string());

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .thread_name("iem-server")
        .build()
        .map_err(|e| format!("failed to create IEM runtime: {e}"))?;

    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
    let (shutdown_tx, shutdown_rx) = broadcast::channel(1);
    let (port_tx, port_rx) = oneshot::channel();

    rt.spawn(iem::signaling::run_server(cmd_rx, shutdown_rx, port_tx));

    let ws_port = rt
        .block_on(port_rx)
        .map_err(|_| "failed to receive WS port")?;

    if ws_port == 0 {
        return Err("IEM server failed to bind".to_string());
    }

    let mdns = match MdnsAdvertiser::new(&server_ip, ws_port) {
        Ok(m) => Some(m),
        Err(e) => {
            warn!("IEM: mDNS advertisement failed (server still running): {e}");
            None
        }
    };

    info!("IEM: server started on {server_ip}:{ws_port}");

    let status = IemStatus {
        running: true,
        ws_port: Some(ws_port),
        server_ip: Some(server_ip.clone()),
        connected_clients: 0,
    };

    *guard = Some(IemHandle {
        cmd_tx,
        shutdown_tx,
        ws_port,
        server_ip,
        _mdns: mdns,
        _runtime: rt,
    });

    Ok(status)
}

/// Stop the IEM server, disconnect all clients.
pub fn stop() -> Result<(), String> {
    let mut guard = IEM_HANDLE.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = guard.take() {
        let _ = handle.cmd_tx.send(Command::Shutdown);
        let _ = handle.shutdown_tx.send(());
        if let Some(mdns) = handle._mdns {
            mdns.shutdown();
        }
        info!("IEM: server stopped");
    }
    Ok(())
}

/// Return current server status.
pub fn status() -> IemStatus {
    let guard = IEM_HANDLE.lock().unwrap_or_else(|e| e.into_inner());
    match guard.as_ref() {
        Some(handle) => IemStatus {
            running: true,
            ws_port: Some(handle.ws_port),
            server_ip: Some(handle.server_ip.clone()),
            connected_clients: 0,
        },
        None => IemStatus {
            running: false,
            ws_port: None,
            server_ip: None,
            connected_clients: 0,
        },
    }
}

/// Begin streaming stems for a song.
pub fn play(file_hash: &str, position_ms: u64) -> Result<(), String> {
    let (reply_tx, reply_rx) = oneshot::channel();
    let rt_handle = {
        let guard = IEM_HANDLE.lock().map_err(|e| e.to_string())?;
        let handle = guard.as_ref().ok_or("IEM server is not running")?;
        handle
            .cmd_tx
            .send(Command::Play {
                file_hash: file_hash.to_string(),
                position_ms,
                reply: reply_tx,
            })
            .map_err(|_| "IEM server channel closed")?;
        handle._runtime.handle().clone()
    };
    rt_handle
        .block_on(reply_rx)
        .map_err(|_| "IEM play response lost")?
}

/// Pause RTP streaming.
pub fn pause() -> Result<(), String> {
    let (reply_tx, reply_rx) = oneshot::channel();
    let rt_handle = {
        let guard = IEM_HANDLE.lock().map_err(|e| e.to_string())?;
        let handle = guard.as_ref().ok_or("IEM server is not running")?;
        handle
            .cmd_tx
            .send(Command::Pause { reply: reply_tx })
            .map_err(|_| "IEM server channel closed")?;
        handle._runtime.handle().clone()
    };
    rt_handle
        .block_on(reply_rx)
        .map_err(|_| "IEM pause response lost")?
}

/// Stop RTP streaming (song ended / stopped).
pub fn stop_playback() -> Result<(), String> {
    let (reply_tx, reply_rx) = oneshot::channel();
    let rt_handle = {
        let guard = IEM_HANDLE.lock().map_err(|e| e.to_string())?;
        let handle = guard.as_ref().ok_or("IEM server is not running")?;
        handle
            .cmd_tx
            .send(Command::StopPlayback { reply: reply_tx })
            .map_err(|_| "IEM server channel closed")?;
        handle._runtime.handle().clone()
    };
    rt_handle
        .block_on(reply_rx)
        .map_err(|_| "IEM stop_playback response lost")?
}
