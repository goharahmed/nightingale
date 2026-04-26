use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::net::UdpSocket;
use tokio::sync::RwLock;
use tracing::{debug, warn};

use super::clock::build_sender_report;
use super::signaling::ServerState;
use super::StemInfo;

const FRAME_DURATION: Duration = Duration::from_micros(5000); // 5ms
const SAMPLES_PER_FRAME: u32 = 240; // 5ms at 48kHz
const OPUS_PAYLOAD_TYPE: u8 = 111;
const RTCP_INTERVAL: Duration = Duration::from_secs(1);

/// Per-stem RTP state.
struct StemRtpState {
    ssrc: u32,
    seq: u16,
    timestamp: u32,
    packet_count: u32,
    octet_count: u32,
}

/// The streaming engine sends RTP packets on a 5ms timer.
pub struct StreamingEngine {
    cancel_tx: tokio::sync::watch::Sender<bool>,
}

impl StreamingEngine {
    pub fn start(
        socket: Arc<UdpSocket>,
        state: Arc<RwLock<ServerState>>,
        stems: Vec<StemInfo>,
        frames: HashMap<String, Vec<Vec<u8>>>,
        start_frame: usize,
    ) -> Self {
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

        tokio::spawn(streaming_loop(
            socket, state, stems, frames, start_frame, cancel_rx,
        ));

        Self { cancel_tx }
    }

    pub fn stop(self) {
        let _ = self.cancel_tx.send(true);
    }
}

async fn streaming_loop(
    socket: Arc<UdpSocket>,
    state: Arc<RwLock<ServerState>>,
    stems: Vec<StemInfo>,
    frames: HashMap<String, Vec<Vec<u8>>>,
    start_frame: usize,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
) {
    let max_frames = frames
        .values()
        .map(|f| f.len())
        .max()
        .unwrap_or(0);

    if max_frames == 0 {
        warn!("IEM streaming: no frames to send");
        return;
    }

    let mut rtp_states: HashMap<String, StemRtpState> = stems
        .iter()
        .map(|s| {
            (
                s.id.clone(),
                StemRtpState {
                    ssrc: s.ssrc,
                    seq: 0,
                    timestamp: (start_frame as u32) * SAMPLES_PER_FRAME,
                    packet_count: 0,
                    octet_count: 0,
                },
            )
        })
        .collect();

    let mut frame_idx = start_frame;
    let mut next_tick = Instant::now();
    let mut last_rtcp = Instant::now();
    let is_first_packet = frame_idx == start_frame;

    debug!(
        "IEM streaming: starting from frame {start_frame}/{max_frames} ({} stems)",
        stems.len()
    );

    loop {
        // Check for cancellation
        if *cancel_rx.borrow() {
            debug!("IEM streaming: cancelled");
            return;
        }

        if frame_idx >= max_frames {
            debug!("IEM streaming: reached end of song");
            return;
        }

        // Gather client addresses
        let client_addrs: Vec<SocketAddr> = {
            let st = state.read().await;
            st.sessions.values().map(|s| s.rtp_addr()).collect()
        };

        if !client_addrs.is_empty() {
            for stem in &stems {
                let Some(stem_frames) = frames.get(&stem.id) else {
                    continue;
                };
                if frame_idx >= stem_frames.len() {
                    continue;
                }

                let opus_data = &stem_frames[frame_idx];
                let rtp_state = rtp_states.get_mut(&stem.id).unwrap();

                let marker = is_first_packet && rtp_state.packet_count == 0;
                let packet = build_rtp_packet(
                    rtp_state.ssrc,
                    rtp_state.seq,
                    rtp_state.timestamp,
                    marker,
                    opus_data,
                );

                for addr in &client_addrs {
                    if let Err(e) = socket.send_to(&packet, addr).await {
                        warn!("IEM: UDP send to {addr} failed: {e}");
                    }
                }

                rtp_state.seq = rtp_state.seq.wrapping_add(1);
                rtp_state.packet_count += 1;
                rtp_state.octet_count += opus_data.len() as u32;
            }

            // Send RTCP Sender Reports periodically
            if last_rtcp.elapsed() >= RTCP_INTERVAL {
                let now_us = super::now_us();
                let ntp_secs = (now_us / 1_000_000) as u32;
                let ntp_frac = ((now_us % 1_000_000) as u64 * u32::MAX as u64 / 1_000_000) as u32;

                for stem in &stems {
                    let rtp_state = rtp_states.get(&stem.id).unwrap();
                    let sr = build_sender_report(
                        rtp_state.ssrc,
                        ntp_secs,
                        ntp_frac,
                        rtp_state.timestamp,
                        rtp_state.packet_count,
                        rtp_state.octet_count,
                    );
                    for addr in &client_addrs {
                        let _ = socket.send_to(&sr, addr).await;
                    }
                }
                last_rtcp = Instant::now();
            }
        }

        // Advance timestamps
        for rtp_state in rtp_states.values_mut() {
            rtp_state.timestamp = rtp_state.timestamp.wrapping_add(SAMPLES_PER_FRAME);
        }
        frame_idx += 1;

        // Sleep until the next 5ms tick, compensating for processing time
        next_tick += FRAME_DURATION;
        let now = Instant::now();
        if next_tick > now {
            tokio::select! {
                _ = tokio::time::sleep(next_tick - now) => {}
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        return;
                    }
                }
            }
        }
    }
}

fn build_rtp_packet(ssrc: u32, seq: u16, timestamp: u32, marker: bool, payload: &[u8]) -> Vec<u8> {
    let mut packet = Vec::with_capacity(12 + payload.len());

    // V=2, P=0, X=0, CC=0
    packet.push(0x80);
    // M bit + PT
    let second_byte = if marker {
        0x80 | OPUS_PAYLOAD_TYPE
    } else {
        OPUS_PAYLOAD_TYPE
    };
    packet.push(second_byte);
    packet.extend_from_slice(&seq.to_be_bytes());
    packet.extend_from_slice(&timestamp.to_be_bytes());
    packet.extend_from_slice(&ssrc.to_be_bytes());
    packet.extend_from_slice(payload);

    packet
}
