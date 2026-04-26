use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, info, warn};

use super::clock::run_clock_sync;
use super::session::IemSession;
use super::streaming::StreamingEngine;
use super::{Command, PlaybackState, StemInfo};

/// Shared server state accessible from WebSocket handlers and the command loop.
pub struct ServerState {
    pub sessions: HashMap<String, IemSession>,
    pub playback: PlaybackState,
    pub current_stems: Vec<StemInfo>,
    pub current_frames: HashMap<String, Vec<Vec<u8>>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            playback: PlaybackState::Stopped,
            current_stems: Vec::new(),
            current_frames: HashMap::new(),
        }
    }

    pub fn client_count(&self) -> u32 {
        self.sessions.len() as u32
    }
}

/// Run the IEM signaling + streaming server. This is the main async entry point.
pub async fn run_server(
    mut cmd_rx: mpsc::UnboundedReceiver<Command>,
    shutdown_rx: broadcast::Receiver<()>,
    ws_port_tx: tokio::sync::oneshot::Sender<u16>,
) {
    let listener = match TcpListener::bind("0.0.0.0:0").await {
        Ok(l) => l,
        Err(e) => {
            warn!("IEM: failed to bind WebSocket listener: {e}");
            let _ = ws_port_tx.send(0);
            return;
        }
    };
    let ws_port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let _ = ws_port_tx.send(ws_port);
    info!("IEM: WebSocket server listening on 0.0.0.0:{ws_port}");

    let rtp_socket = match UdpSocket::bind("0.0.0.0:0").await {
        Ok(s) => Arc::new(s),
        Err(e) => {
            warn!("IEM: failed to bind UDP socket: {e}");
            return;
        }
    };
    info!(
        "IEM: RTP socket bound on {}",
        rtp_socket.local_addr().unwrap()
    );

    let state = Arc::new(RwLock::new(ServerState::new()));
    let mut shutdown = shutdown_rx;
    let mut streaming_engine: Option<StreamingEngine> = None;

    loop {
        tokio::select! {
            // Accept new WebSocket connections
            accepted = listener.accept() => {
                match accepted {
                    Ok((stream, addr)) => {
                        let state = Arc::clone(&state);
                        let rtp_socket = Arc::clone(&rtp_socket);
                        tokio::spawn(handle_connection(stream, addr, state, rtp_socket));
                    }
                    Err(e) => warn!("IEM: accept error: {e}"),
                }
            }

            // Process commands from the Tauri thread
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(Command::Play { file_hash, position_ms, reply }) => {
                        let result = handle_play(
                            &file_hash,
                            position_ms,
                            &state,
                            &rtp_socket,
                            &mut streaming_engine,
                        ).await;
                        let _ = reply.send(result);
                    }
                    Some(Command::Pause { reply }) => {
                        let result = handle_pause(&state, &mut streaming_engine).await;
                        let _ = reply.send(result);
                    }
                    Some(Command::StopPlayback { reply }) => {
                        let result = handle_stop_playback(&state, &mut streaming_engine).await;
                        let _ = reply.send(result);
                    }
                    Some(Command::Shutdown) | None => {
                        info!("IEM: shutting down server");
                        if let Some(engine) = streaming_engine.take() {
                            engine.stop();
                        }
                        // Close all WebSocket connections
                        let mut st = state.write().await;
                        for (_, mut session) in st.sessions.drain() {
                            let _ = session.ws_sender.close().await;
                        }
                        break;
                    }
                }
            }

            // Shutdown signal
            _ = shutdown.recv() => {
                info!("IEM: received shutdown signal");
                if let Some(engine) = streaming_engine.take() {
                    engine.stop();
                }
                break;
            }
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    state: Arc<RwLock<ServerState>>,
    _rtp_socket: Arc<UdpSocket>,
) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            warn!("IEM: WebSocket handshake failed from {addr}: {e}");
            return;
        }
    };
    info!("IEM: new WebSocket connection from {addr}");

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    // Wait for the client's connect message
    let connect_msg = match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        ws_rx.next(),
    )
    .await
    {
        Ok(Some(Ok(Message::Text(text)))) => {
            serde_json::from_str::<serde_json::Value>(&text).ok()
        }
        _ => None,
    };

    let rtp_port = match connect_msg
        .as_ref()
        .and_then(|m| m.get("rtp_port"))
        .and_then(|v| v.as_u64())
    {
        Some(p) => p as u16,
        None => {
            warn!("IEM: invalid connect message from {addr}");
            return;
        }
    };

    let session_id = format!("{:08x}", rand::random::<u32>());
    debug!("IEM: client {addr} assigned session {session_id}, rtp_port={rtp_port}");

    // Send session response
    let session_msg = serde_json::json!({
        "type": "session",
        "session_id": &session_id,
        "clock_sync": true,
    });
    if ws_tx
        .send(Message::Text(session_msg.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    // Clock sync: use a temp channel to receive responses
    let (sync_tx, mut sync_rx) = mpsc::channel::<serde_json::Value>(16);
    let clock_rounds = 8;

    // Spawn a task to forward WS messages to the sync channel
    let (forward_done_tx, mut forward_done_rx) = mpsc::channel::<()>(1);
    let sync_tx_clone = sync_tx.clone();
    let forward_handle = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            if let Message::Text(text) = msg {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                    if sync_tx_clone.send(val).await.is_err() {
                        break;
                    }
                }
            }
        }
        let _ = forward_done_tx.send(()).await;
    });

    let clock_offset = match run_clock_sync(&mut ws_tx, &mut sync_rx, clock_rounds).await {
        Ok(offset) => offset,
        Err(e) => {
            warn!("IEM: clock sync failed for {addr}: {e}");
            0
        }
    };

    let session = IemSession {
        session_id: session_id.clone(),
        client_addr: addr,
        rtp_port,
        clock_offset_us: clock_offset,
        connected_at: Instant::now(),
        ws_sender: ws_tx,
    };

    // Register session and send current state if a song is playing
    {
        let mut st = state.write().await;

        // Extract playback info before mutating sessions (avoids borrow conflict)
        let catchup_msgs: Option<(serde_json::Value, serde_json::Value)> = match &st.playback {
            PlaybackState::Playing {
                file_hash,
                start_position_ms,
                started_at_us,
            } => {
                let stems_msg = build_song_loaded_msg(file_hash, &st.current_stems);
                let play_msg = serde_json::json!({
                    "type": "play",
                    "position_ms": *start_position_ms,
                    "server_time_us": *started_at_us,
                });
                Some((stems_msg, play_msg))
            }
            PlaybackState::Paused {
                file_hash,
                position_ms,
            } => {
                let stems_msg = build_song_loaded_msg(file_hash, &st.current_stems);
                let pause_msg = serde_json::json!({
                    "type": "pause",
                    "position_ms": *position_ms,
                });
                Some((stems_msg, pause_msg))
            }
            PlaybackState::Stopped => None,
        };

        st.sessions.insert(session_id.clone(), session);

        if let Some((msg1, msg2)) = catchup_msgs {
            if let Some(s) = st.sessions.get_mut(&session_id) {
                let _ = s.ws_sender.send(Message::Text(msg1.to_string().into())).await;
                let _ = s.ws_sender.send(Message::Text(msg2.to_string().into())).await;
            }
        }

        info!(
            "IEM: session {session_id} registered ({} total clients)",
            st.sessions.len()
        );
    }

    // Wait for the client to disconnect
    tokio::select! {
        _ = forward_done_rx.recv() => {}
        _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => {}
    }

    // Clean up
    forward_handle.abort();
    let mut st = state.write().await;
    st.sessions.remove(&session_id);
    info!(
        "IEM: session {session_id} disconnected ({} clients remain)",
        st.sessions.len()
    );
}

async fn handle_play(
    file_hash: &str,
    position_ms: u64,
    state: &Arc<RwLock<ServerState>>,
    rtp_socket: &Arc<UdpSocket>,
    streaming_engine: &mut Option<StreamingEngine>,
) -> Result<(), String> {
    use crate::cache::CacheDir;
    use super::transcoder;

    // Stop any existing stream
    if let Some(engine) = streaming_engine.take() {
        engine.stop();
    }

    let cache = CacheDir::new();
    let mp3_stems = transcoder::discover_stems(&cache, file_hash);
    if mp3_stems.is_empty() {
        return Err("no stems found for this song".to_string());
    }

    // Transcode to Opus (blocking I/O — this runs on the tokio runtime but is CPU-bound)
    let opus_stems = transcoder::ensure_opus_stems(&cache, file_hash, &mp3_stems)?;

    // Load all frames into memory
    let mut stem_infos = Vec::new();
    let mut frames_map: HashMap<String, Vec<Vec<u8>>> = HashMap::new();
    let mut ssrc_counter = 1001u32;

    for (stem_id, opus_path) in &opus_stems {
        let frames = transcoder::read_opus_frames(opus_path)?;
        let ssrc = ssrc_counter;
        ssrc_counter += 1;

        stem_infos.push(StemInfo {
            id: stem_id.clone(),
            label: super::stem_label(stem_id).to_string(),
            ssrc,
        });
        frames_map.insert(stem_id.clone(), frames);
    }

    let server_time_us = super::now_us();

    // Update state and notify clients
    {
        let mut st = state.write().await;
        st.current_stems = stem_infos.clone();
        st.current_frames = frames_map.clone();
        st.playback = PlaybackState::Playing {
            file_hash: file_hash.to_string(),
            start_position_ms: position_ms,
            started_at_us: server_time_us,
        };

        let song_msg = build_song_loaded_msg(file_hash, &st.current_stems);
        let play_msg = serde_json::json!({
            "type": "play",
            "position_ms": position_ms,
            "server_time_us": server_time_us,
        });

        for session in st.sessions.values_mut() {
            let _ = session
                .ws_sender
                .send(Message::Text(song_msg.to_string().into()))
                .await;
            let _ = session
                .ws_sender
                .send(Message::Text(play_msg.to_string().into()))
                .await;
        }
    }

    // Start the streaming engine (each frame = 5ms)
    let start_frame = position_ms as usize / OPUS_FRAME_SAMPLES_MS;
    let engine = StreamingEngine::start(
        Arc::clone(rtp_socket),
        Arc::clone(state),
        stem_infos,
        frames_map,
        start_frame,
    );
    *streaming_engine = Some(engine);

    Ok(())
}

const OPUS_FRAME_SAMPLES_MS: usize = 5;

async fn handle_pause(
    state: &Arc<RwLock<ServerState>>,
    streaming_engine: &mut Option<StreamingEngine>,
) -> Result<(), String> {
    if let Some(engine) = streaming_engine.take() {
        engine.stop();
    }

    let mut st = state.write().await;
    let position_ms = match st.playback.clone() {
        PlaybackState::Playing {
            file_hash,
            start_position_ms,
            started_at_us,
        } => {
            let elapsed_us = super::now_us() - started_at_us;
            let pos = start_position_ms + (elapsed_us as u64 / 1000);
            st.playback = PlaybackState::Paused {
                file_hash,
                position_ms: pos,
            };
            pos
        }
        PlaybackState::Paused { position_ms, .. } => position_ms,
        PlaybackState::Stopped => return Ok(()),
    };

    let pause_msg = serde_json::json!({
        "type": "pause",
        "position_ms": position_ms,
    });

    for session in st.sessions.values_mut() {
        let _ = session
            .ws_sender
            .send(Message::Text(pause_msg.to_string().into()))
            .await;
    }

    Ok(())
}

async fn handle_stop_playback(
    state: &Arc<RwLock<ServerState>>,
    streaming_engine: &mut Option<StreamingEngine>,
) -> Result<(), String> {
    if let Some(engine) = streaming_engine.take() {
        engine.stop();
    }

    let mut st = state.write().await;
    st.playback = PlaybackState::Stopped;
    st.current_stems.clear();
    st.current_frames.clear();

    let stop_msg = serde_json::json!({ "type": "stop" });
    for session in st.sessions.values_mut() {
        let _ = session
            .ws_sender
            .send(Message::Text(stop_msg.to_string().into()))
            .await;
    }

    Ok(())
}

fn build_song_loaded_msg(file_hash: &str, stems: &[StemInfo]) -> serde_json::Value {
    let stems_json: Vec<serde_json::Value> = stems
        .iter()
        .map(|s| {
            serde_json::json!({
                "id": s.id,
                "label": s.label,
                "ssrc": s.ssrc,
            })
        })
        .collect();

    serde_json::json!({
        "type": "song_loaded",
        "file_hash": file_hash,
        "stems": stems_json,
    })
}

/// Build an `IemStatus` from the current state.
pub async fn get_status(state: &Arc<RwLock<ServerState>>) -> u32 {
    state.read().await.client_count()
}
