# WiFi In-Ear Monitoring — Server Design Specification

> Nightingale wireless IEM: turn any smartphone into a personal monitor mixer over WiFi.

---

## 1. Overview

This feature adds a WiFi-based in-ear monitoring (IEM) system to Nightingale. The desktop
application acts as a master streaming server, delivering real-time audio stems to smartphone
clients on the same local network. Each connected phone functions as a wireless IEM receiver —
singers wear earbuds/headphones and get an independent monitor mix with per-stem volume control.

**Key constraints:**

- End-to-end latency target: **< 30ms**
- Clients are **passive receivers** — no remote playback control
- Server streams **all available stems** to every connected client
- Clients mix stems locally with per-stem volume faders
- Feature is **opt-in** via settings, off by default

---

## 2. Architecture

### 2.1 Module Placement

The IEM server lives as a new module in `app-core`, following the same pattern as `media_server.rs`:

```
app-core/src/
├── iem_server.rs          # Top-level module: lifecycle, public API
├── iem/
│   ├── mod.rs             # Re-exports
│   ├── discovery.rs       # mDNS advertisement
│   ├── signaling.rs       # WebSocket server + JSON protocol
│   ├── streaming.rs       # RTP/RTCP sender engine
│   ├── transcoder.rs      # MP3→Opus lazy transcoding + cache
│   ├── session.rs         # Client session tracking
│   └── clock.rs           # NTP-style clock sync + RTCP SR generation
```

Tauri commands in `client/src-tauri/src/lib.rs` wire the module to the frontend:

- `iem_start()` — Start the IEM server (WebSocket + mDNS + RTP)
- `iem_stop()` — Stop the IEM server, disconnect all clients
- `iem_status()` — Return server state (running/stopped, connected client count, port)
- `iem_play(file_hash, position_ms)` — Begin streaming stems for a song
- `iem_pause()` — Pause RTP streaming
- `iem_stop_playback()` — Stop RTP streaming (song ended / stopped)

### 2.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Nightingale Desktop                         │
│                                                                 │
│  ┌──────────┐    Tauri      ┌──────────────────────────────┐    │
│  │ React UI │──commands────▶│        app-core/iem          │    │
│  │          │               │                              │    │
│  │ play()   │               │  ┌────────────┐              │    │
│  │ pause()  │               │  │ transcoder │ MP3→Opus     │    │
│  │ stop()   │               │  │  (lazy)    │ cache        │    │
│  └──────────┘               │  └─────┬──────┘              │    │
│                             │        │ Opus frames         │    │
│                             │        ▼                     │    │
│                             │  ┌────────────┐              │    │
│                             │  │ streaming  │ RTP/UDP      │    │
│                             │  │  engine    │──────────────────▶ Clients
│                             │  └────────────┘              │    │
│                             │                              │    │
│                             │  ┌────────────┐  WebSocket   │    │
│                             │  │ signaling  │──────────────────▶ Clients
│                             │  └────────────┘              │    │
│                             │                              │    │
│                             │  ┌────────────┐  mDNS        │    │
│                             │  │ discovery  │──────────────────▶ LAN
│                             │  └────────────┘              │    │
│                             └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Relationship to Existing Playback

The frontend remains the playback authority. The IEM module is a **follower** — it receives
events from the frontend via Tauri commands and drives its own RTP clock from those events:

1. Frontend calls `iem_play(file_hash, position_ms)` when a song starts
2. IEM module resolves stem paths from `CacheDir`, transcodes to Opus if needed
3. IEM module starts sending RTP packets from the given position
4. Frontend calls `iem_pause()` / `iem_stop_playback()` on state changes
5. IEM module stops/resumes RTP accordingly

The IEM module does **not** read or interfere with the existing `AudioContext`/cpal playback
pipeline. Both pipelines run independently, driven by the same frontend events.

---

## 3. Service Discovery

### 3.1 mDNS Advertisement

When the IEM server starts, it advertises via mDNS (DNS-SD):

- **Service type:** `_nightingale-iem._tcp.local`
- **Port:** WebSocket signaling port
- **TXT records:** `v=1` (protocol version)

**Crate:** `mdns-sd` (pure Rust, async-compatible)

The advertisement is registered on `iem_start()` and unregistered on `iem_stop()`.

### 3.2 QR Code

The desktop UI displays a QR code when the IEM server is enabled. Content:

```
nightingale://connect?host=<server_ip>&port=<ws_port>&v=1
```

The custom URI scheme `nightingale://` allows the client app to handle the QR scan directly.
The QR code is generated in the React frontend using a JS library (e.g., `qrcode.react`),
with the connection details provided by `iem_status()`.

**IP detection:** The server determines its LAN IP by enumerating network interfaces and
selecting the first non-loopback IPv4 address. If multiple interfaces exist, the UI can
show a dropdown.

---

## 4. Signaling Protocol (WebSocket)

### 4.1 Transport

- **Bind:** `0.0.0.0:<port>` (LAN-accessible)
- **Port:** OS-assigned (port 0), reported to frontend via `iem_status()`
- **Protocol:** WebSocket (RFC 6455) over TCP
- **Crate:** `tokio-tungstenite` or `axum` with WebSocket upgrade
- **Direction:** Primarily server→client; client sends only the connect handshake

### 4.2 Message Format

All messages are JSON with a `type` field discriminator.

#### Client → Server

**Connect (first message after WebSocket upgrade):**

```json
{
  "type": "connect",
  "rtp_port": 5004
}
```

- `rtp_port`: UDP port the client is listening on for RTP packets

#### Server → Client

**Session Established:**

```json
{
  "type": "session",
  "session_id": "a1b2c3d4",
  "clock_sync": true
}
```

**Clock Sync Request (NTP-style, sent 5-10 times at connection):**

```json
{
  "type": "clock_sync_request",
  "server_time_us": 1714089600000000
}
```

Client responds with:

```json
{
  "type": "clock_sync_response",
  "server_time_us": 1714089600000000,
  "client_time_us": 1714089600002500
}
```

The server computes RTT and clock offset from multiple exchanges.

**Song Loaded (sent when a song is about to play):**

```json
{
  "type": "song_loaded",
  "file_hash": "abc123...",
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "duration_secs": 354.5,
  "stems": [
    { "id": "instrumental", "label": "Instrumental", "ssrc": 1001 },
    { "id": "vocals",       "label": "Guide Vocal",  "ssrc": 1002 },
    { "id": "male_vocals",  "label": "Male Vocal",   "ssrc": 1003 },
    { "id": "female_vocals","label": "Female Vocal",  "ssrc": 1004 }
  ]
}
```

- `stems` is a dynamic array — the client renders a fader per entry
- Each stem has a unique `ssrc` for RTP demuxing

**Play:**

```json
{
  "type": "play",
  "position_ms": 0,
  "server_time_us": 1714089605000000
}
```

- `position_ms`: playback position in the song
- `server_time_us`: server wall-clock timestamp at the moment playback was triggered
  (allows the client to compute exact playout schedule using the synced clock offset)

**Pause:**

```json
{
  "type": "pause",
  "position_ms": 45000
}
```

**Stop:**

```json
{
  "type": "stop"
}
```

**Client Disconnected (server internal, not sent on wire):**

When a WebSocket connection drops, the server cleans up the session and stops sending
RTP packets to that client's address.

---

## 5. Audio Streaming (RTP/RTCP)

### 5.1 RTP Configuration

| Parameter          | Value                                      |
|--------------------|--------------------------------------------|
| Transport          | UDP unicast                                |
| Payload type       | Dynamic (e.g., 111 for Opus)               |
| Codec              | Opus                                       |
| Sample rate        | 48000 Hz                                   |
| Channels           | 1 (mono) per stem                          |
| Frame size         | 5ms (240 samples at 48kHz)                 |
| Bitrate            | 128 kbps per stem                          |
| Clock rate         | 48000 (RTP timestamp units)                |
| SSRC               | One unique value per stem (from `song_loaded` message) |
| Server socket      | Single UDP socket, all stems and clients   |

### 5.2 Packet Structure

Standard RTP header (12 bytes) + Opus payload:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|V=2|P|X|  CC   |M|     PT      |       Sequence Number         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           Timestamp                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                             SSRC                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Opus Compressed Data                      |
|                             ...                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

- **Sequence number:** Incremented per packet per stem (allows the client to detect loss)
- **Timestamp:** Incremented by 240 per packet (5ms × 48000 / 1000)
- **SSRC:** Identifies which stem this packet belongs to
- **Marker bit (M):** Set on the first packet after a pause/resume or song start

### 5.3 Sending Model

**Shared encoding, per-client unicast:**

1. The streaming engine reads Opus frames from cache (or from the real-time fallback encoder)
2. For each 5ms tick, it produces one Opus frame per stem
3. For each connected client, it wraps each frame in an RTP packet addressed to `client_ip:client_rtp_port`
4. All packets are sent from a single server UDP socket

**Timing:** A high-resolution timer thread (or `tokio` interval at 5ms) drives the packet
sending loop. The thread sleeps between ticks and compensates for scheduling jitter by
tracking the wall clock and adjusting the next sleep duration.

### 5.4 RTCP Sender Reports

The server sends RTCP Sender Reports every **1 second** to each connected client:

```
 ┌──────────────────────────────────────────────────┐
 │ RTCP Sender Report (SR)                          │
 │                                                  │
 │  NTP timestamp  : server wall clock (64-bit)     │
 │  RTP timestamp  : corresponding RTP ts           │
 │  Packet count   : total RTP packets sent         │
 │  Octet count    : total payload bytes sent       │
 └──────────────────────────────────────────────────┘
```

The client uses the NTP↔RTP timestamp mapping to align its playout clock with the
server's clock, corrected by the initial clock offset computed during the WebSocket
handshake.

### 5.5 Bandwidth Estimate

| Scenario                     | Calculation                    | Total      |
|------------------------------|--------------------------------|------------|
| 4 stems, 1 client, 128kbps  | 4 × 128 kbps                  | 512 kbps   |
| 4 stems, 5 clients, 128kbps | 4 × 128 × 5                   | 2.56 Mbps  |
| 4 stems, 10 clients         | 4 × 128 × 10                  | 5.12 Mbps  |

Well within any WiFi network's capacity.

---

## 6. Opus Transcoding & Lazy Cache

### 6.1 Transcoding Pipeline

```
MP3 stem (disk) → symphonia decode → PCM (f32, 48kHz, mono) → Opus encode → Ogg Opus file (disk)
```

- **Decoder:** `symphonia` (already in dependency tree)
- **Encoder:** `opus` or `audiopus` crate (libopus bindings)
- **Container:** Ogg Opus (`.opus` file extension)
- **Parameters:** 48kHz, mono, 128kbps, 5ms frame size

### 6.2 Cache Strategy: Hybrid Lazy

- **On-demand at play time:** When `iem_play(file_hash)` is called, the server checks for
  cached `.opus` files. If missing, it transcodes the MP3 stems synchronously before starting
  the RTP stream. The cold-start delay (~2-3 seconds for a typical song) results in a brief
  silence in earbuds on first play.
- **Cached for subsequent plays:** Once transcoded, the `.opus` files persist on disk.
  Future plays of the same song are instant.
- **Real-time fallback:** If for any reason the file-based cache is unavailable, the server
  falls back to real-time transcoding (decode MP3 frame-by-frame, encode Opus, packetize).

### 6.3 Cache File Naming

Follows the existing `CacheDir` convention:

```
{file_hash}_instrumental.opus
{file_hash}_vocals.opus
{file_hash}_male_vocals.opus
{file_hash}_female_vocals.opus
{file_hash}_instrumental_{key}_{tempo}.opus    # key/tempo variants
{file_hash}_vocals_{key}_{tempo}.opus
```

New methods on `CacheDir`:

```rust
pub fn iem_stem_path(&self, hash: &str, stem_id: &str) -> PathBuf {
    self.path.join(format!("{hash}_{stem_id}.opus"))
}

pub fn iem_variant_stem_path(&self, hash: &str, stem_id: &str, key: &str, tempo: f64) -> PathBuf {
    self.path.join(format!(
        "{hash}_{stem_id}_{}_{}.opus",
        sanitize_key(key),
        format_tempo(tempo)
    ))
}
```

### 6.4 Cache Cleanup

The `delete_song_cache` method in `CacheDir` must be extended to also remove `.opus` files
for the given hash. The glob pattern `{hash}_*.opus` covers all IEM cache files for a song.

---

## 7. Stem Discovery

The IEM server needs to know which stems exist for a given song. This depends on the
separation model used during analysis and any post-processing (male/female vocal split).

### 7.1 Stem Resolution

When `iem_play(file_hash)` is called:

1. Call `get_audio_paths(file_hash)` to get the current instrumental + vocals MP3 paths
2. Check for additional stems (male/female vocal splits) using the existing cache naming:
   - `{hash}_male_vocals.mp3`
   - `{hash}_female_vocals.mp3`
3. Build the stem list dynamically based on what files exist on disk
4. Assign a unique SSRC to each stem
5. Send the `song_loaded` message to all connected clients with the stem list

### 7.2 Stem Metadata

Each stem carries:
- `id`: Machine-readable identifier (e.g., `"instrumental"`, `"vocals"`, `"male_vocals"`)
- `label`: Human-readable display name (e.g., `"Instrumental"`, `"Guide Vocal"`, `"Male Vocal"`)
- `ssrc`: Unique RTP SSRC for this stem in the current session

The `id` and `label` are derived from the filename convention. If future stem types are
added (drums, bass, etc.), the same convention extends naturally.

---

## 8. Client Session Management

### 8.1 Session Lifecycle

```
Phone scans QR / discovers via mDNS
         │
         ▼
WebSocket connect to server
         │
         ▼
Client sends: { "type": "connect", "rtp_port": 5004 }
         │
         ▼
Server assigns session_id, records (ip, rtp_port)
Server sends: { "type": "session", "session_id": "..." }
         │
         ▼
NTP-style clock sync (5-10 exchanges)
         │
         ▼
If a song is currently playing:
  Server sends: song_loaded + play
         │
         ▼
Client receives RTP streams, mixes locally
         │
         ▼
WebSocket close or timeout → server removes session
```

### 8.2 Session State (Server-Side)

```rust
struct IemSession {
    session_id: String,
    client_addr: SocketAddr,      // IP from WebSocket connection
    rtp_port: u16,                // From connect message
    clock_offset_us: i64,         // Computed from NTP exchanges
    connected_at: Instant,
    ws_sender: WsSender,          // For pushing signaling messages
}
```

### 8.3 Late Joiners

If a client connects while a song is already playing:

1. Server sends `song_loaded` with stem list
2. Server sends `play` with the **current** position and server timestamp
3. Server immediately starts sending RTP packets to the new client from the current position
4. Client syncs to the stream mid-song

### 8.4 Disconnection

- **Clean:** Client closes WebSocket. Server removes session, stops sending RTP.
- **Unclean:** WebSocket TCP keepalive or ping/pong timeout (e.g., 10 seconds). Server
  removes session.
- **Disconnect all:** `iem_stop()` closes all WebSocket connections and stops all RTP.

---

## 9. Clock Synchronization

### 9.1 Initial Sync (NTP-style over WebSocket)

At connection time, the server and client exchange 5-10 rapid ping-pong messages:

1. Server sends `clock_sync_request` with `server_time_us` (microsecond wall clock)
2. Client immediately responds with `clock_sync_response` containing the original
   `server_time_us` and the client's `client_time_us`
3. Server computes RTT and one-way delay estimate:
   - `rtt = now_server - server_time_us`
   - `one_way = rtt / 2`
   - `offset = client_time_us - (server_time_us + one_way)`
4. After all exchanges, the server takes the **median** offset (robust to outliers)
5. Offset is stored in the session and sent to the client

On a LAN with < 5ms RTT, this achieves **sub-millisecond** clock offset accuracy.

### 9.2 Ongoing Sync (RTCP Sender Reports)

RTCP SRs sent every 1 second allow the client to continuously refine its clock mapping:

- The SR's NTP timestamp corresponds to a specific RTP timestamp
- The client adjusts its playout buffer depth to compensate for any observed drift
- Typical drift between two unsynchronized system clocks: < 100μs/second — negligible
  over a 5-minute song, but RTCP corrects it anyway

---

## 10. Configuration & UI Integration

### 10.1 AppConfig Extensions

New fields in `AppConfig` (`app-core/src/config.rs`):

```rust
pub struct AppConfig {
    // ... existing fields ...

    /// Enable the WiFi IEM server. Default: false (off).
    pub iem_enabled: Option<bool>,
}
```

The IEM server starts/stops based on this setting. The Tauri app checks this on launch
and calls `iem_start()` if enabled.

### 10.2 Frontend UI Elements

1. **Settings page:** Toggle for "WiFi In-Ear Monitoring"
2. **QR code modal:** Displayed when IEM is enabled, showing the connection QR code
   and the server address/port in text form
3. **Status badge:** Small icon in the playback UI showing IEM status:
   - Hidden when IEM is disabled
   - Headphone icon + count when IEM is enabled (e.g., "🎧 3" for 3 connected clients)
4. **Connected clients panel** (accessible from badge): List of connected clients
   showing IP and connection duration, with a "Disconnect All" button

### 10.3 Tauri Command → Frontend Integration

The frontend hooks into IEM via Tauri commands triggered from the existing playback flow:

```typescript
// In the playback hook, after audio starts:
if (iemEnabled) {
  await invoke("iem_play", { fileHash, positionMs: 0 });
}

// On pause:
if (iemEnabled) {
  await invoke("iem_pause");
}

// On stop / song end:
if (iemEnabled) {
  await invoke("iem_stop_playback");
}
```

---

## 11. New Rust Dependencies

| Crate              | Purpose                                    |
|--------------------|--------------------------------------------|
| `mdns-sd`          | mDNS/DNS-SD service advertisement          |
| `tokio-tungstenite`| WebSocket server (or `axum` if preferred)  |
| `opus` / `audiopus`| Opus encoding (libopus bindings)           |
| `ogg`              | Ogg container read/write for cached files  |
| `rtp-rs`           | RTP packet construction                    |
| `tokio`            | Async runtime for WebSocket + timers       |

`symphonia` (MP3 decoding) and `cpal` are already in the dependency tree.

---

## 12. Latency Budget

| Stage                        | Time       | Notes                              |
|------------------------------|------------|-------------------------------------|
| Read Opus frame from cache   | ~0ms       | Pre-buffered in memory              |
| RTP packetization            | ~0ms       | Memcpy + header write               |
| Network transit (WiFi LAN)   | 2-3ms      | Based on measured gateway RTT       |
| Client jitter buffer         | 5-10ms     | Absorbs WiFi timing variance        |
| Opus decode                  | ~1ms       | Hardware-accelerated on most phones |
| Audio output buffer (phone)  | 5-10ms     | Platform-dependent minimum          |
| **Total**                    | **~13-24ms** | Within 30ms budget               |

The 5ms Opus frame size means the server accumulates 5ms of audio before encoding,
which is the dominant fixed latency contribution on the server side.

---

## 13. Error Handling

| Scenario                     | Behavior                                       |
|------------------------------|-------------------------------------------------|
| Client WebSocket drops       | Remove session, stop sending RTP to that client  |
| Opus transcode fails         | Log error, skip IEM for this song, notify frontend |
| Stem file missing            | Exclude that stem from the stem list             |
| All stems missing            | Send `stop` to clients, log error                |
| UDP send fails               | Log warning, continue (UDP is best-effort)       |
| Port bind fails              | Return error from `iem_start()`, notify frontend |

---

## 14. Future Extensions

These are explicitly **out of scope** for the current implementation but the architecture
supports them:

- **Internet streaming (Nightingale Connect):** The same `app-core/iem` module can be
  extended with a WebRTC transport layer for Internet clients. The signaling WebSocket
  and stem resolution are reusable.
- **Per-client stem presets:** Server remembers preferred stem levels per client profile.
- **Additional stem types:** Drums, bass, other (Demucs 4-stem mode). The protocol's
  dynamic stem list handles this with no changes.
- **Stereo stems:** Change `channels` from 1 to 2 in the Opus encoder config. RTP
  carries stereo Opus transparently.
- **Client-to-server audio:** Microphone input from phones for remote singers (requires
  bidirectional RTP, significant latency considerations).
