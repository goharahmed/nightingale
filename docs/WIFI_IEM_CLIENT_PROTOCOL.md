# WiFi In-Ear Monitoring — Client Protocol Specification

> Everything a client app developer needs to implement a Nightingale IEM receiver.

---

## 1. Overview

The Nightingale IEM client is a smartphone application that connects to a Nightingale
desktop server over WiFi and acts as a wireless in-ear monitor. The client receives
real-time audio stems (instrumental, vocals, male/female vocal splits, etc.) and provides
per-stem volume faders so the singer can create their own monitor mix.

**The client is a passive receiver.** It cannot control playback (play/pause/stop/skip).
All playback decisions are made on the Nightingale desktop. The client's only
responsibilities are:

1. Discover and connect to the server
2. Synchronize its clock with the server
3. Receive RTP audio streams
4. Decode Opus and mix stems locally
5. Output audio to earbuds/headphones with minimal latency
6. Present per-stem volume faders to the user

---

## 2. Connection Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        Connection Flow                           │
│                                                                  │
│  1. Discover server (mDNS or QR code scan)                       │
│  2. Open UDP socket on any available port                        │
│  3. Connect WebSocket to ws://<server_ip>:<ws_port>              │
│  4. Send connect message with RTP port                           │
│  5. Receive session acknowledgement                              │
│  6. Perform clock sync exchanges (5-10 rounds)                   │
│  7. Receive song_loaded (if a song is currently active)          │
│  8. Receive play → begin RTP reception + audio output            │
│  9. Ongoing: receive RTP packets, mix, play                      │
│ 10. Receive pause/stop → silence output, wait for next event     │
│ 11. WebSocket close → clean up, return to discovery              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Server Discovery

### 3.1 mDNS (Primary)

Browse for the service type:

```
_nightingale-iem._tcp.local
```

The resolved service provides:
- **Host:** Server's IP address (IPv4)
- **Port:** WebSocket signaling port
- **TXT records:** `v=1` (protocol version)

**Platform APIs:**
- iOS: `NWBrowser` (Network framework) or `NetServiceBrowser`
- Android: `NsdManager` (android.net.nsd)

### 3.2 QR Code (Secondary / Fallback)

The Nightingale desktop displays a QR code containing:

```
nightingale://connect?host=192.168.1.50&port=9800&v=1
```

| Parameter | Type   | Description               |
|-----------|--------|---------------------------|
| `host`    | String | Server IPv4 address       |
| `port`    | Number | WebSocket signaling port  |
| `v`       | Number | Protocol version (must be 1) |

Register the `nightingale://` URI scheme in the client app so QR scanning opens the app
directly.

---

## 4. WebSocket Signaling Protocol

### 4.1 Connection

```
ws://<host>:<port>
```

No TLS required (LAN-only). No authentication.

### 4.2 Client → Server Messages

#### `connect`

Sent immediately after WebSocket upgrade. Must be the first message.

```json
{
  "type": "connect",
  "rtp_port": 5004
}
```

| Field      | Type   | Required | Description                             |
|------------|--------|----------|-----------------------------------------|
| `type`     | String | Yes      | Always `"connect"`                      |
| `rtp_port` | Number | Yes      | UDP port the client is listening on     |

#### `clock_sync_response`

Sent in response to each `clock_sync_request` from the server.

```json
{
  "type": "clock_sync_response",
  "server_time_us": 1714089600000000,
  "client_time_us": 1714089600002500
}
```

| Field            | Type   | Required | Description                                      |
|------------------|--------|----------|--------------------------------------------------|
| `type`           | String | Yes      | Always `"clock_sync_response"`                   |
| `server_time_us` | Number | Yes      | Echoed from the request (server's original time)  |
| `client_time_us` | Number | Yes      | Client's wall clock at time of response (μs)      |

**Timing is critical:** Respond to clock sync requests as fast as possible. Do not perform
any heavy work between receiving the request and sending the response. Read the client's
wall clock immediately upon receiving the message.

### 4.3 Server → Client Messages

#### `session`

Sent after the server processes the `connect` message.

```json
{
  "type": "session",
  "session_id": "a1b2c3d4",
  "clock_sync": true
}
```

| Field        | Type    | Description                              |
|--------------|---------|------------------------------------------|
| `session_id` | String  | Unique identifier for this session       |
| `clock_sync` | Boolean | If true, clock sync exchanges will follow |

#### `clock_sync_request`

Sent 5-10 times during initial connection setup, approximately 50ms apart.

```json
{
  "type": "clock_sync_request",
  "server_time_us": 1714089600000000
}
```

| Field            | Type   | Description                                   |
|------------------|--------|-----------------------------------------------|
| `server_time_us` | Number | Server's wall clock in microseconds (epoch)   |

Respond with `clock_sync_response` immediately.

#### `clock_sync_result`

Sent after all sync exchanges are complete.

```json
{
  "type": "clock_sync_result",
  "offset_us": -1250,
  "rtt_us": 2400
}
```

| Field       | Type   | Description                                              |
|-------------|--------|----------------------------------------------------------|
| `offset_us` | Number | `client_clock - server_clock` in microseconds            |
| `rtt_us`    | Number | Measured round-trip time in microseconds                 |

Store this offset. Use it to convert server timestamps to client local time:

```
client_local_time = server_time + offset_us
```

#### `song_loaded`

Sent when a new song is loaded for playback. Update the UI with song info and stem faders.

```json
{
  "type": "song_loaded",
  "file_hash": "abc123def456...",
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "duration_secs": 354.5,
  "stems": [
    { "id": "instrumental",  "label": "Instrumental",  "ssrc": 1001 },
    { "id": "vocals",        "label": "Guide Vocal",   "ssrc": 1002 },
    { "id": "male_vocals",   "label": "Male Vocal",    "ssrc": 1003 },
    { "id": "female_vocals", "label": "Female Vocal",  "ssrc": 1004 }
  ]
}
```

| Field          | Type   | Description                                    |
|----------------|--------|------------------------------------------------|
| `file_hash`    | String | Unique identifier for the song                 |
| `title`        | String | Song title                                     |
| `artist`       | String | Artist name                                    |
| `duration_secs`| Number | Song duration in seconds                       |
| `stems`        | Array  | Available audio stems for this song            |
| `stems[].id`   | String | Machine-readable stem identifier               |
| `stems[].label`| String | Human-readable label for the UI fader          |
| `stems[].ssrc` | Number | RTP SSRC value for this stem's packets         |

**Important:** The `stems` array is dynamic. Different songs may have different numbers of
stems (2-4 typically). The client must render faders dynamically based on this array.
Map each `ssrc` to the corresponding fader for local volume mixing.

#### `play`

Sent when playback starts or resumes.

```json
{
  "type": "play",
  "position_ms": 0,
  "server_time_us": 1714089605000000
}
```

| Field            | Type   | Description                                           |
|------------------|--------|-------------------------------------------------------|
| `position_ms`    | Number | Current position in the song (milliseconds)           |
| `server_time_us` | Number | Server wall clock when playback was triggered (μs)    |

On receiving `play`:
1. Calculate the target playout time using `server_time_us + offset_us`
2. Start listening on the UDP socket for RTP packets
3. Buffer incoming packets in the jitter buffer
4. Begin audio output, scheduling playout based on RTP timestamps

#### `pause`

Sent when playback is paused. RTP packets will stop arriving.

```json
{
  "type": "pause",
  "position_ms": 45000
}
```

| Field         | Type   | Description                              |
|---------------|--------|------------------------------------------|
| `position_ms` | Number | Position where playback was paused       |

On receiving `pause`:
1. Stop audio output (silence)
2. Flush the jitter buffer
3. Update UI to show paused state
4. Continue listening for the next `play` or `stop`

#### `stop`

Sent when playback stops (song ended, user stopped, or session ending).

```json
{
  "type": "stop"
}
```

On receiving `stop`:
1. Stop audio output
2. Flush the jitter buffer and reset all decoders
3. Update UI to show idle/waiting state

---

## 5. RTP Audio Reception

### 5.1 Socket Setup

Open a UDP socket bound to `0.0.0.0:<any_port>`. Report the port number in the
WebSocket `connect` message. All RTP and RTCP packets from the server arrive on
this single socket.

### 5.2 RTP Packet Format

Standard RTP (RFC 3550), 12-byte header + Opus payload:

```
Byte 0:    V=2, P=0, X=0, CC=0  → 0x80
Byte 1:    M bit + PT (dynamic, e.g., 111)
Bytes 2-3: Sequence number (big-endian, 16-bit)
Bytes 4-7: Timestamp (big-endian, 32-bit, clock rate 48000)
Bytes 8-11: SSRC (big-endian, 32-bit)
Bytes 12+: Opus compressed frame
```

| Field     | Size    | Description                                         |
|-----------|---------|-----------------------------------------------------|
| Version   | 2 bits  | Always 2                                            |
| Padding   | 1 bit   | 0                                                   |
| Extension | 1 bit   | 0                                                   |
| CSRC count| 4 bits  | 0                                                   |
| Marker    | 1 bit   | 1 = first packet after play/resume, 0 otherwise     |
| PT        | 7 bits  | Dynamic payload type (e.g., 111 = Opus)             |
| Seq       | 16 bits | Per-SSRC sequence counter                           |
| Timestamp | 32 bits | Audio sample timestamp (increments by 240 per frame)|
| SSRC      | 32 bits | Identifies the stem (from `song_loaded` message)    |

### 5.3 Opus Decoding

Each SSRC requires its own Opus decoder instance:

- **Sample rate:** 48000 Hz
- **Channels:** 1 (mono)
- **Frame size:** 240 samples (5ms)

When a new `song_loaded` message arrives, reset all decoders and create new ones
for the new SSRCs.

### 5.4 Demultiplexing

All stems arrive on the same UDP port, distinguished by SSRC:

```
incoming packet → extract SSRC from header
                → lookup SSRC in stem map (from song_loaded)
                → route to correct decoder + jitter buffer
```

### 5.5 RTCP Sender Reports

The server periodically sends RTCP SR packets (payload type 200). These arrive on the
same UDP socket as RTP. Distinguish by checking the payload type byte:

- **RTP:** Byte 1 bits [0:6] = dynamic PT (e.g., 111)
- **RTCP SR:** Byte 1 = 200

RTCP SR structure (28 bytes minimum):

```
Bytes 0-3:   Header (V=2, PT=200, length)
Bytes 4-7:   SSRC of sender
Bytes 8-15:  NTP timestamp (64-bit: 32-bit seconds + 32-bit fraction since 1900)
Bytes 16-19: RTP timestamp corresponding to the NTP time
Bytes 20-23: Sender's packet count
Bytes 24-27: Sender's octet count
```

Use the NTP↔RTP timestamp pair to maintain clock alignment. Combined with the initial
`clock_sync_result` offset, this gives you a continuous mapping from RTP timestamps to
local wall clock time.

---

## 6. Jitter Buffer

### 6.1 Purpose

WiFi packet delivery times vary by 1-5ms. The jitter buffer absorbs this variance
by holding packets briefly before playing them.

### 6.2 Recommended Implementation

- **Type:** Adaptive, per-SSRC (one jitter buffer per stem)
- **Target depth:** 5-10ms (1-2 packets at 5ms frame size)
- **Maximum depth:** 20ms (4 packets) — beyond this, skip to catch up
- **Minimum depth:** 1 packet (5ms)

### 6.3 Packet Ordering

Packets may arrive out of order. Use the RTP sequence number to reorder within the
jitter buffer window. Drop packets that arrive too late (their playout time has passed).

### 6.4 Packet Loss Handling

At < 0.1% loss on LAN, this is rare. When a packet is missing at playout time:

- **Option A:** Opus PLC (Packet Loss Concealment) — pass `NULL` data to the Opus
  decoder, which generates a smooth interpolation. This is the recommended approach.
- **Option B:** Output silence for that 5ms frame.

Do **not** request retransmission — it would exceed the latency budget.

---

## 7. Local Audio Mixing

### 7.1 Mix Pipeline

```
SSRC 1001 → Opus decode → PCM → ×[volume_instrumental] ─┐
SSRC 1002 → Opus decode → PCM → ×[volume_vocals]        ├→ Sum → Audio Output
SSRC 1003 → Opus decode → PCM → ×[volume_male_vocals]   │
SSRC 1004 → Opus decode → PCM → ×[volume_female_vocals] ─┘
```

Each stem's PCM output is multiplied by its volume coefficient (0.0 to 1.0) and summed.
Apply simple clipping or soft limiting to prevent output overflow when multiple stems
are at full volume.

### 7.2 Volume Control

- **Range:** 0.0 (mute) to 1.0 (full volume)
- **Default:** All stems at 1.0
- **UI:** One vertical slider/fader per stem, labeled with the `label` from `song_loaded`
- **Update rate:** Volume changes are applied per-frame (every 5ms) — use a smoothing
  ramp over ~10ms to avoid clicks/pops when adjusting
- **Persistence:** Volume settings should be saved locally on the device and restored
  when reconnecting. Save per-stem-id (not per-SSRC, since SSRCs change between songs).

### 7.3 Audio Output Configuration

- **Sample rate:** 48000 Hz
- **Channels:** 1 (mono) or 2 (duplicate mono to both ears)
- **Buffer size:** As small as the platform allows:
  - iOS: `AVAudioSession` with `.measurement` category, buffer duration 0.005 (5ms)
  - Android: `AAudio` / `Oboe` in low-latency mode, performance mode `LowLatency`
- **Priority:** Audio rendering thread should run at real-time priority

---

## 8. Client UI Specification

### 8.1 States

The client app has four visual states:

#### Discovering / Not Connected

- Show "Searching for Nightingale..." with a spinner
- Option to scan QR code manually
- List discovered servers (if multiple mDNS results)

#### Connected — Idle

- Show "Connected to Nightingale" with server info
- Show "Waiting for song..." message
- Show connection status indicator (green dot)

#### Connected — Playing

- Show song title and artist
- Show per-stem volume faders (dynamically rendered from `song_loaded`)
- Show playback position / duration progress bar (computed from `position_ms`)
- Connection status indicator

#### Connected — Paused

- Same as Playing but with a "Paused" overlay
- Faders remain visible and adjustable

### 8.2 Fader Layout

```
┌─────────────────────────────────────┐
│     Bohemian Rhapsody               │
│     Queen                           │
│     ━━━━━━━━━━━━━━━━━━━━━━━━━  3:24 │
│                                     │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
│  │ ▓▓▓ │ │ ▓▓▓ │ │ ▓▓▓ │ │ ▓▓▓ │  │
│  │ ▓▓▓ │ │ ▓▓▓ │ │ ▓▓▓ │ │ ░░░ │  │
│  │ ▓▓▓ │ │ ▓▓▓ │ │ ░░░ │ │ ░░░ │  │
│  │ ▓▓▓ │ │ ░░░ │ │ ░░░ │ │ ░░░ │  │
│  │ ░░░ │ │ ░░░ │ │ ░░░ │ │ ░░░ │  │
│  └─────┘ └─────┘ └─────┘ └─────┘  │
│  Instr.  Guide   Male    Female    │
│          Vocal   Vocal   Vocal     │
│                                     │
│          🟢 Connected               │
└─────────────────────────────────────┘
```

### 8.3 Error States

| Condition                | UI Behavior                                     |
|--------------------------|--------------------------------------------------|
| Server not found         | "No server found. Check WiFi connection."        |
| WebSocket disconnected   | "Connection lost. Reconnecting..." + auto-retry  |
| No RTP packets received  | After 5s timeout: "No audio received. Check connection." |
| Clock sync failed        | Proceed without sync; audio may be slightly off  |

### 8.4 Auto-Reconnect

If the WebSocket connection drops unexpectedly:
1. Attempt reconnect immediately
2. If failed, retry with exponential backoff: 1s, 2s, 4s, 8s, max 15s
3. On reconnect, re-send `connect` with RTP port, redo clock sync
4. If a song is playing, the server will send `song_loaded` + `play` automatically

---

## 9. Platform-Specific Notes

### 9.1 iOS

- **Audio session:** `AVAudioSession` category `.playback` with mode `.measurement`
  for lowest latency. Set preferred buffer duration to 0.005 (5ms).
- **Background audio:** Enable "Audio, AirPlay, and Picture in Picture" background mode
  so audio continues when the screen locks.
- **mDNS:** Use `NWBrowser` from Network.framework. Requires no special entitlements
  for local network discovery (but the Local Network permission prompt will appear).
- **UDP:** Use `NWConnection` with UDP protocol or raw POSIX sockets.
- **Opus:** Use the `libopus` C library via a Swift wrapper or an existing package
  like `OpusKit`.

### 9.2 Android

- **Audio output:** Use `Oboe` (C++) or `AAudio` (API 26+) for low-latency audio.
  Set performance mode to `PerformanceMode::LowLatency` and sharing mode to
  `SharingMode::Exclusive` if available.
- **Background audio:** Use a foreground `Service` with an ongoing notification to
  keep the app alive when the screen is off.
- **mDNS:** Use `NsdManager` for service discovery.
- **UDP:** Standard `java.net.DatagramSocket` or NDK-level sockets.
- **Opus:** Use `libopus` via JNI or an existing Android binding.
- **WiFi lock:** Acquire a `WifiManager.WifiLock` to prevent WiFi from sleeping.

---

## 10. Testing & Debugging

### 10.1 Verifying RTP Reception

The cached Ogg Opus files on the server are standard `.opus` files playable in VLC,
ffplay, or any Opus-capable player. Use these to verify that the source audio is correct
independent of the streaming pipeline.

### 10.2 Simulating the Client

A minimal client can be built with:
1. Python: `websockets` for signaling + raw UDP socket for RTP + `opuslib` for decoding
2. GStreamer: `udpsrc` → `rtpopusdepay` → `opusdec` → `autoaudiosink`

### 10.3 Latency Measurement

To measure end-to-end latency:
1. Place the phone next to a speaker connected to the Nightingale desktop
2. Play a song with a sharp transient (clap, click)
3. Record both the speaker and earbud output with an external recorder
4. Measure the time difference between the two transients in an audio editor

Target: < 30ms.

---

## 11. Protocol Version

This document describes **protocol version 1** (`v=1`).

Future protocol versions will be backward-incompatible changes. The client should check
the version during mDNS discovery or QR code parsing and reject servers with unsupported
versions, displaying a "Please update your app" message.

Minor additions (new message types, new fields in existing messages) are backward-compatible
and do not require a version bump. Clients should ignore unknown message types and unknown
fields gracefully.
