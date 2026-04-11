use cpal::device_description::DeviceType;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use pitch_detection::detector::mcleod::McLeodDetector;
use pitch_detection::detector::PitchDetector;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

// ── Constants ────────────────────────────────────────────────────────────────

const PITCH_WINDOW: usize = 2048;
const AUDIO_QUEUE_CAP: usize = 24_000;
const MONITOR_GAIN: f32 = 0.65;
const MIN_PITCH_HZ: f32 = 80.0;
const MAX_PITCH_HZ: f32 = 1000.0;
const PITCH_POWER_THRESHOLD: f32 = 0.15;
const PITCH_CLARITY_THRESHOLD: f32 = 0.35;
const MIC_RMS_GATE: f32 = 0.002;

/// Digital input gain applied after mono-extraction.  Professional audio
/// interfaces (especially multi-channel digital mixers) often deliver very
/// low levels (-90 to -30 dBFS).  A 20 dB boost (10×) brings them into the
/// range where the pitch detector and RMS gate can work properly.
const MIC_INPUT_GAIN: f32 = 10.0;

/// Maximum simultaneous microphone capture slots.
pub const MAX_MIC_SLOTS: usize = 4;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MicrophoneInfo {
    pub name: String,
}

/// Extended device info that includes input channel count.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InputDeviceInfo {
    pub name: String,
    pub max_channels: usize,
}

/// Pitch event now includes the slot index so the frontend can route it.
#[derive(Debug, Clone, Serialize)]
struct MicPitchEvent {
    slot: usize,
    pitch: Option<f32>,
    /// RMS level of the current window (0.0–1.0). Always sent so the UI can
    /// show an input level meter even when pitch is below the gate threshold.
    rms: f32,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[allow(dead_code)]
pub struct MicAudioEvent {
    slot: usize,
    sample_rate: u32,
    samples: Vec<f32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, TS)]
#[ts(export)]
#[serde(default)]
pub struct MicCaptureOptions {
    pub emit_pitch: bool,
    pub emit_audio: bool,
}

impl Default for MicCaptureOptions {
    fn default() -> Self {
        Self {
            emit_pitch: true,
            emit_audio: false,
        }
    }
}

/// Configuration for starting a single mic slot from the frontend.
#[derive(Debug, Clone, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct MicSlotConfig {
    /// Slot index 0..3
    pub slot: usize,
    /// Device name (`None` = default input device).
    pub device_name: Option<String>,
    /// Which mono input channel to capture from the device (0-indexed).
    /// `None` means down-mix all channels to mono (legacy behaviour).
    pub input_channel: Option<usize>,
    /// Capture options (pitch / audio emission).
    #[serde(default)]
    pub options: MicCaptureOptions,
}

// ── Per-slot state ───────────────────────────────────────────────────────────

struct MicSlotState {
    running: AtomicBool,
    shutdown: AtomicBool,
    options: Mutex<MicCaptureOptions>,
}

impl MicSlotState {
    fn new() -> Self {
        Self {
            running: AtomicBool::new(false),
            shutdown: AtomicBool::new(false),
            options: Mutex::new(MicCaptureOptions::default()),
        }
    }
}

static MIC_SLOTS: once_cell::sync::Lazy<[Arc<MicSlotState>; MAX_MIC_SLOTS]> =
    once_cell::sync::Lazy::new(|| {
        [
            Arc::new(MicSlotState::new()),
            Arc::new(MicSlotState::new()),
            Arc::new(MicSlotState::new()),
            Arc::new(MicSlotState::new()),
        ]
    });

// ── Legacy single-mic globals (backward-compat for `start_mic_capture`) ──────

static MIC_RUNNING: AtomicBool = AtomicBool::new(false);
static MIC_SHUTDOWN: once_cell::sync::Lazy<Arc<AtomicBool>> =
    once_cell::sync::Lazy::new(|| Arc::new(AtomicBool::new(false)));
static MIC_OPTIONS: once_cell::sync::Lazy<Arc<Mutex<MicCaptureOptions>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(MicCaptureOptions::default())));

// ── Helpers ──────────────────────────────────────────────────────────────────

fn device_display_name(device: &cpal::Device) -> String {
    let Ok(desc) = device.description() else {
        return "(unknown)".into();
    };
    if let Some(friendly) = desc.extended().first() {
        return friendly.clone();
    }
    desc.to_string()
}

fn is_virtual(device: &cpal::Device) -> bool {
    let Ok(desc) = device.description() else {
        return false;
    };
    matches!(desc.device_type(), DeviceType::Virtual)
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

fn i16_to_f32(sample: i16) -> f32 {
    sample as f32 / i16::MAX as f32
}

fn i32_to_f32(sample: i32) -> f32 {
    sample as f32 / i32::MAX as f32
}

fn f32_to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

fn f32_to_u16(sample: f32) -> u16 {
    ((sample.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32) as u16
}

fn f32_to_i32(sample: f32) -> i32 {
    (sample.clamp(-1.0, 1.0) * i32::MAX as f32) as i32
}

fn f32_to_u32(sample: f32) -> u32 {
    ((sample.clamp(-1.0, 1.0) * 0.5 + 0.5) * u32::MAX as f32) as u32
}

/// When a specific input channel is requested, ensure we open the device with
/// enough channels to actually capture it.  Many multi-channel interfaces
/// (e.g. 32-in digital mixers) report a 2-channel *default* config; opening
/// with only 2 channels means higher-numbered channels are never seen.
fn resolve_input_channels(
    device: &cpal::Device,
    default_cfg: &cpal::SupportedStreamConfig,
    input_channel: Option<usize>,
) -> u16 {
    let needed: u16 = input_channel
        .map(|ic| (ic as u16) + 1)
        .unwrap_or(0);

    if needed <= default_cfg.channels() {
        return default_cfg.channels();
    }

    // Search for a supported config that has enough channels at the same
    // sample rate as the default config.
    let target_rate = default_cfg.sample_rate();
    let found = device
        .supported_input_configs()
        .ok()
        .and_then(|cfgs| {
            cfgs.filter(|c| {
                c.channels() >= needed
                    && c.min_sample_rate() <= target_rate
                    && c.max_sample_rate() >= target_rate
            })
            .min_by_key(|c| c.channels())
            .map(|c| c.channels())
        });

    match found {
        Some(ch) => {
            info!(
                "[mic] upgrading from {}ch to {}ch to reach input_channel {}",
                default_cfg.channels(),
                ch,
                input_channel.unwrap_or(0)
            );
            ch
        }
        None => {
            warn!(
                "[mic] device does not support {} channels at {} Hz; using default {}ch",
                needed,
                target_rate,
                default_cfg.channels()
            );
            default_cfg.channels()
        }
    }
}

fn push_mapped_input<T, F>(
    data: &[T],
    push: &Arc<dyn Fn(&[f32]) + Send + Sync>,
    mut map: F,
)
where
    T: Copy,
    F: FnMut(T) -> f32,
{
    let floats: Vec<f32> = data.iter().copied().map(&mut map).collect();
    push(&floats);
}

fn write_output_frames<T, F>(
    data: &mut [T],
    channels: usize,
    next_sample: &Arc<dyn Fn() -> f32 + Send + Sync>,
    mut map: F,
)
where
    T: Copy,
    F: FnMut(f32) -> T,
{
    for frame in data.chunks_mut(channels) {
        let out_sample = map(next_sample());
        for out in frame {
            *out = out_sample;
        }
    }
}

fn find_device(preferred: Option<&str>) -> Result<(cpal::Device, String), String> {
    let host = cpal::default_host();

    if let Some(name) = preferred {
        let devices = host
            .input_devices()
            .map_err(|e| format!("input devices: {e}"))?;
        for dev in devices {
            if device_display_name(&dev) == name {
                return Ok((dev, name.to_string()));
            }
        }
        return Err(format!("Microphone '{name}' not found"));
    }

    let device = host
        .default_input_device()
        .ok_or_else(|| "No default microphone found".to_string())?;
    let name = device_display_name(&device);
    Ok((device, name))
}

// ── Tauri Commands ───────────────────────────────────────────────────────────

/// List microphone names (backward-compatible, no channel info).
#[tauri::command]
pub fn list_microphones() -> Result<Vec<MicrophoneInfo>, String> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| format!("input devices: {e}"))?;

    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();

    for device in devices {
        if device.default_input_config().is_err() || is_virtual(&device) {
            continue;
        }
        let name = device_display_name(&device);
        let key = name.to_lowercase();
        if seen.insert(key) {
            out.push(MicrophoneInfo { name });
        }
    }

    Ok(out)
}

/// List input devices **with** their maximum channel counts.
/// This is the multi-mic equivalent of `get_audio_output_devices`.
#[tauri::command]
pub fn list_input_devices() -> Result<Vec<InputDeviceInfo>, String> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| format!("input devices: {e}"))?;

    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();

    for device in devices {
        if is_virtual(&device) {
            continue;
        }
        let name = device_display_name(&device);
        let key = name.to_lowercase();
        if seen.contains(&key) {
            continue;
        }

        let max_channels = device
            .supported_input_configs()
            .ok()
            .map(|cfgs| cfgs.fold(0usize, |max, cfg| max.max(cfg.channels() as usize)))
            .unwrap_or(0);

        if max_channels == 0 {
            continue;
        }

        seen.insert(key);
        out.push(InputDeviceInfo {
            name,
            max_channels,
        });
    }

    Ok(out)
}

// ── Legacy single-mic commands (slot 0 backward compat) ──────────────────────

#[tauri::command]
pub fn start_mic_capture(
    app: AppHandle,
    preferred: Option<String>,
    input_channel: Option<usize>,
    options: Option<MicCaptureOptions>,
) -> Result<String, String> {
    let next_options = options.unwrap_or_default();
    if let Ok(mut opts) = MIC_OPTIONS.lock() {
        *opts = next_options;
    }

    if MIC_RUNNING.swap(true, Ordering::SeqCst) {
        MIC_SHUTDOWN.store(false, Ordering::SeqCst);
        return Ok("already running".into());
    }

    MIC_SHUTDOWN.store(false, Ordering::SeqCst);

    let (device, name) = find_device(preferred.as_deref()).map_err(|e| {
        MIC_RUNNING.store(false, Ordering::SeqCst);
        e
    })?;

    let device_name = name.clone();
    let shutdown = Arc::clone(&MIC_SHUTDOWN);
    let options = Arc::clone(&MIC_OPTIONS);

    std::thread::spawn(move || {
        run_mic_loop(device, &name, 0, input_channel, app, shutdown, options);
        MIC_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(device_name)
}

#[tauri::command]
pub fn stop_mic_capture() {
    MIC_SHUTDOWN.store(true, Ordering::SeqCst);
}

// ── Multi-mic slot commands ──────────────────────────────────────────────────

/// Start capture on a specific slot (0..3).
/// If the slot is already running, update its options and return early.
#[tauri::command]
pub fn start_mic_slot(
    app: AppHandle,
    config: MicSlotConfig,
) -> Result<String, String> {
    if config.slot >= MAX_MIC_SLOTS {
        return Err(format!("Invalid slot {} (max {})", config.slot, MAX_MIC_SLOTS - 1));
    }

    let slot_state = Arc::clone(&MIC_SLOTS[config.slot]);

    // Update options
    if let Ok(mut opts) = slot_state.options.lock() {
        *opts = config.options.clone();
    }

    // If already running, just update (don't restart)
    if slot_state.running.swap(true, Ordering::SeqCst) {
        slot_state.shutdown.store(false, Ordering::SeqCst);
        info!("[mic] slot {} already running, updated options", config.slot);
        return Ok("updated".into());
    }

    slot_state.shutdown.store(false, Ordering::SeqCst);

    let (device, name) = find_device(config.device_name.as_deref()).map_err(|e| {
        slot_state.running.store(false, Ordering::SeqCst);
        e
    })?;

    let device_name = name.clone();
    let slot = config.slot;
    let input_channel = config.input_channel;
    let ss = Arc::clone(&slot_state);

    std::thread::spawn(move || {
        run_mic_loop_slot(device, &name, slot, input_channel, app, ss);
    });

    Ok(device_name)
}

/// Stop capture on a specific slot.
#[tauri::command]
pub fn stop_mic_slot(slot: usize) -> Result<(), String> {
    if slot >= MAX_MIC_SLOTS {
        return Err(format!("Invalid slot {} (max {})", slot, MAX_MIC_SLOTS - 1));
    }
    MIC_SLOTS[slot].shutdown.store(true, Ordering::SeqCst);
    Ok(())
}

/// Stop all mic slots.
#[tauri::command]
pub fn stop_all_mic_slots() {
    for s in MIC_SLOTS.iter() {
        s.shutdown.store(true, Ordering::SeqCst);
    }
    // Also stop legacy single-mic if active
    MIC_SHUTDOWN.store(true, Ordering::SeqCst);
}

/// Query which slots are currently running.
#[tauri::command]
pub fn get_mic_slot_status() -> Vec<bool> {
    MIC_SLOTS
        .iter()
        .map(|s| s.running.load(Ordering::Relaxed))
        .collect()
}

// ── Input stream builder ─────────────────────────────────────────────────────

/// Build an input stream that extracts a single channel (`input_channel`)
/// or down-mixes all channels to mono when `input_channel` is `None`.
fn try_build_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    pitch_shared: Arc<Mutex<VecDeque<f32>>>,
    audio_shared: Arc<Mutex<VecDeque<f32>>>,
    options: Arc<Mutex<MicCaptureOptions>>,
    input_channel: Option<usize>,
) -> Option<cpal::Stream> {
    let ch = config.channels as usize;
    let push_samples: Arc<dyn Fn(&[f32]) + Send + Sync> = {
        let pitch_cb = Arc::clone(&pitch_shared);
        let audio_cb = Arc::clone(&audio_shared);
        let options_cb = Arc::clone(&options);
        Arc::new(move |data: &[f32]| {
            let options = options_cb
                .lock()
                .map(|o| o.clone())
                .unwrap_or_else(|_| MicCaptureOptions::default());
            if !options.emit_pitch && !options.emit_audio {
                return;
            }

            // Extract mono samples: pick a specific channel or down-mix all,
            // then apply input gain to bring low-level professional signals
            // into a usable range for pitch detection.
            let mut mono_samples = Vec::with_capacity(data.len() / ch.max(1));
            for chunk in data.chunks(ch) {
                let raw = match input_channel {
                    Some(ic) if ic < chunk.len() => chunk[ic],
                    Some(_) => chunk.iter().sum::<f32>() / ch as f32, // fallback
                    None => chunk.iter().sum::<f32>() / ch as f32,
                };
                mono_samples.push((raw * MIC_INPUT_GAIN).clamp(-1.0, 1.0));
            }

            if options.emit_pitch {
                if let Ok(mut q) = pitch_cb.try_lock() {
                    for sample in &mono_samples {
                        q.push_back(*sample);
                    }
                    while q.len() > PITCH_WINDOW * 2 {
                        q.pop_front();
                    }
                }
            }

            if options.emit_audio {
                if let Ok(mut q) = audio_cb.try_lock() {
                    for sample in &mono_samples {
                        q.push_back(*sample);
                    }
                    while q.len() > AUDIO_QUEUE_CAP {
                        q.pop_front();
                    }
                }
            }
        })
    };

    use cpal::SampleFormat;
    let stream = match sample_format {
        SampleFormat::F32 => {
            let push = push_samples.clone();
            device.build_input_stream(
                config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| push(data),
                |err| warn!("[mic] stream error: {err}"),
                None,
            )
        }
        SampleFormat::I16 => {
            let push = push_samples.clone();
            device.build_input_stream(
                config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    push_mapped_input(data, &push, i16_to_f32);
                },
                |err| warn!("[mic] stream error: {err}"),
                None,
            )
        }
        SampleFormat::I32 => {
            let push = push_samples.clone();
            device.build_input_stream(
                config,
                move |data: &[i32], _: &cpal::InputCallbackInfo| {
                    push_mapped_input(data, &push, i32_to_f32);
                },
                |err| warn!("[mic] stream error: {err}"),
                None,
            )
        }
        _ => return None,
    };

    let stream = match stream {
        Ok(s) => s,
        Err(e) => {
            warn!("[mic] build stream failed: {e}");
            return None;
        }
    };

    if let Err(e) = stream.play() {
        warn!("[mic] play failed: {e}");
        return None;
    }

    Some(stream)
}

fn try_build_output_stream(
    device: &cpal::Device,
    audio_shared: Arc<Mutex<VecDeque<f32>>>,
    options: Arc<Mutex<MicCaptureOptions>>,
) -> Option<cpal::Stream> {
    let default_cfg = match device.default_output_config() {
        Ok(c) => c,
        Err(e) => {
            warn!("[mic] output config error: {e}");
            return None;
        }
    };
    let sample_format = default_cfg.sample_format();
    let config = cpal::StreamConfig {
        channels: default_cfg.channels(),
        sample_rate: default_cfg.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let ch = config.channels as usize;

    let next_sample: Arc<dyn Fn() -> f32 + Send + Sync> = {
        let options = Arc::clone(&options);
        let audio_shared = Arc::clone(&audio_shared);
        Arc::new(move || -> f32 {
            let emit_audio = options.lock().map(|o| o.emit_audio).unwrap_or(false);
            if !emit_audio {
                return 0.0;
            }
            if let Ok(mut q) = audio_shared.try_lock() {
                q.pop_front().unwrap_or(0.0) * MONITOR_GAIN
            } else {
                0.0
            }
        })
    };

    use cpal::SampleFormat;
    let stream = match sample_format {
        SampleFormat::F32 => {
            let next = Arc::clone(&next_sample);
            device.build_output_stream(
                &config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    write_output_frames(data, ch, &next, |sample| sample);
                },
                |err| warn!("[mic] output stream error: {err}"),
                None,
            )
        }
        SampleFormat::I16 => {
            let next = Arc::clone(&next_sample);
            device.build_output_stream(
                &config,
                move |data: &mut [i16], _: &cpal::OutputCallbackInfo| {
                    write_output_frames(data, ch, &next, f32_to_i16);
                },
                |err| warn!("[mic] output stream error: {err}"),
                None,
            )
        }
        SampleFormat::U16 => {
            let next = Arc::clone(&next_sample);
            device.build_output_stream(
                &config,
                move |data: &mut [u16], _: &cpal::OutputCallbackInfo| {
                    write_output_frames(data, ch, &next, f32_to_u16);
                },
                |err| warn!("[mic] output stream error: {err}"),
                None,
            )
        }
        SampleFormat::I32 => {
            let next = Arc::clone(&next_sample);
            device.build_output_stream(
                &config,
                move |data: &mut [i32], _: &cpal::OutputCallbackInfo| {
                    write_output_frames(data, ch, &next, f32_to_i32);
                },
                |err| warn!("[mic] output stream error: {err}"),
                None,
            )
        }
        SampleFormat::U32 => {
            let next = Arc::clone(&next_sample);
            device.build_output_stream(
                &config,
                move |data: &mut [u32], _: &cpal::OutputCallbackInfo| {
                    write_output_frames(data, ch, &next, f32_to_u32);
                },
                |err| warn!("[mic] output stream error: {err}"),
                None,
            )
        }
        _ => {
            warn!("[mic] unsupported output sample format: {sample_format:?}");
            return None;
        }
    };

    let stream = match stream {
        Ok(s) => s,
        Err(e) => {
            warn!("[mic] build output stream failed: {e}");
            return None;
        }
    };
    if let Err(e) = stream.play() {
        warn!("[mic] output play failed: {e}");
        return None;
    }
    Some(stream)
}

// ── Legacy mic loop (slot 0, uses Arc<AtomicBool> shutdown) ──────────────────

fn run_mic_loop(
    device: cpal::Device,
    name: &str,
    slot: usize,
    input_channel: Option<usize>,
    app: AppHandle,
    shutdown: Arc<AtomicBool>,
    options: Arc<Mutex<MicCaptureOptions>>,
) {
    let default_cfg = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            warn!("[mic] '{name}' config error: {e}");
            return;
        }
    };

    let sample_format = default_cfg.sample_format();
    let actual_channels = resolve_input_channels(&device, &default_cfg, input_channel);
    let config = cpal::StreamConfig {
        channels: actual_channels,
        sample_rate: default_cfg.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let sr = config.sample_rate as usize;

    info!(
        "[mic] opening '{name}' slot={slot}: {sr} Hz, {}ch (default {}ch), {sample_format:?}, input_channel={input_channel:?}",
        config.channels, default_cfg.channels()
    );

    let pitch_shared = Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(PITCH_WINDOW * 2)));
    let audio_shared = Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(AUDIO_QUEUE_CAP)));
    let Some(_stream) = try_build_stream(
        &device,
        &config,
        sample_format,
        Arc::clone(&pitch_shared),
        Arc::clone(&audio_shared),
        Arc::clone(&options),
        input_channel,
    ) else {
        warn!("[mic] failed to open '{name}'");
        return;
    };
    let _monitor_stream = cpal::default_host()
        .default_output_device()
        .and_then(|output_device| {
            try_build_output_stream(&output_device, Arc::clone(&audio_shared), Arc::clone(&options))
        });

    info!("[mic] active: {name} (slot {slot})");

    let mut detector = McLeodDetector::new(PITCH_WINDOW, PITCH_WINDOW / 2);
    let sleep_dur = std::time::Duration::from_millis(4);
    let mut logged_first_signal = false;

    loop {
        std::thread::sleep(sleep_dur);

        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        let opts = options
            .lock()
            .map(|o| o.clone())
            .unwrap_or_else(|_| MicCaptureOptions::default());

        if opts.emit_pitch {
            let window = {
                let Ok(q) = pitch_shared.lock() else { break };
                if q.len() < PITCH_WINDOW {
                    Vec::new()
                } else {
                    let start = q.len() - PITCH_WINDOW;
                    q.range(start..).copied().collect::<Vec<_>>()
                }
            };

            if !window.is_empty() {
                let level = rms(&window);
                if !logged_first_signal {
                    info!("[mic] slot {slot} first window: rms={level:.6}, input_channel={input_channel:?}");
                    logged_first_signal = true;
                }
                let pitch = if level < MIC_RMS_GATE {
                    None
                } else {
                    detector
                        .get_pitch(&window, sr, PITCH_POWER_THRESHOLD, PITCH_CLARITY_THRESHOLD)
                        .filter(|p| p.frequency >= MIN_PITCH_HZ && p.frequency <= MAX_PITCH_HZ)
                        .map(|p| p.frequency)
                };
                let _ = app.emit("mic-pitch", MicPitchEvent { slot, pitch, rms: level });
            }
        }
    }
}

// ── Multi-mic slot loop ──────────────────────────────────────────────────────

fn run_mic_loop_slot(
    device: cpal::Device,
    name: &str,
    slot: usize,
    input_channel: Option<usize>,
    app: AppHandle,
    state: Arc<MicSlotState>,
) {
    let default_cfg = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            warn!("[mic] slot {slot} '{name}' config error: {e}");
            state.running.store(false, Ordering::SeqCst);
            return;
        }
    };

    let sample_format = default_cfg.sample_format();
    let actual_channels = resolve_input_channels(&device, &default_cfg, input_channel);
    let config = cpal::StreamConfig {
        channels: actual_channels,
        sample_rate: default_cfg.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let sr = config.sample_rate as usize;

    info!(
        "[mic] slot {slot} opening '{name}': {sr} Hz, {}ch (default {}ch), {sample_format:?}, input_channel={input_channel:?}",
        config.channels, default_cfg.channels()
    );

    let pitch_shared = Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(PITCH_WINDOW * 2)));
    let audio_shared = Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(AUDIO_QUEUE_CAP)));

    // Create a shared options Arc that the stream builder can read from.
    // We sync from the slot state periodically.
    let stream_options = Arc::new(Mutex::new(
        state
            .options
            .lock()
            .map(|o| o.clone())
            .unwrap_or_default(),
    ));

    let Some(_stream) = try_build_stream(
        &device,
        &config,
        sample_format,
        Arc::clone(&pitch_shared),
        Arc::clone(&audio_shared),
        Arc::clone(&stream_options),
        input_channel,
    ) else {
        warn!("[mic] slot {slot} failed to open '{name}'");
        state.running.store(false, Ordering::SeqCst);
        return;
    };

    // Only slot 0 gets monitoring output (to avoid feedback / echo)
    let _monitor_stream = if slot == 0 {
        cpal::default_host()
            .default_output_device()
            .and_then(|output_device| {
                try_build_output_stream(
                    &output_device,
                    Arc::clone(&audio_shared),
                    Arc::clone(&stream_options),
                )
            })
    } else {
        None
    };

    info!("[mic] slot {slot} active: {name}");

    let mut detector = McLeodDetector::new(PITCH_WINDOW, PITCH_WINDOW / 2);
    let sleep_dur = std::time::Duration::from_millis(4);
    let mut logged_first_signal = false;

    loop {
        std::thread::sleep(sleep_dur);

        if state.shutdown.load(Ordering::Relaxed) {
            break;
        }

        // Sync options from slot state → stream_options
        if let Ok(new_opts) = state.options.lock() {
            if let Ok(mut so) = stream_options.try_lock() {
                *so = new_opts.clone();
            }
        }

        let opts = stream_options
            .lock()
            .map(|o| o.clone())
            .unwrap_or_default();

        if opts.emit_pitch {
            let window = {
                let Ok(q) = pitch_shared.lock() else { break };
                if q.len() < PITCH_WINDOW {
                    Vec::new()
                } else {
                    let start = q.len() - PITCH_WINDOW;
                    q.range(start..).copied().collect::<Vec<_>>()
                }
            };

            if !window.is_empty() {
                let level = rms(&window);
                if !logged_first_signal {
                    info!("[mic] slot {slot} first window: rms={level:.6}, input_channel={input_channel:?}");
                    logged_first_signal = true;
                }
                let pitch = if level < MIC_RMS_GATE {
                    None
                } else {
                    detector
                        .get_pitch(&window, sr, PITCH_POWER_THRESHOLD, PITCH_CLARITY_THRESHOLD)
                        .filter(|p| p.frequency >= MIN_PITCH_HZ && p.frequency <= MAX_PITCH_HZ)
                        .map(|p| p.frequency)
                };
                let _ = app.emit("mic-pitch", MicPitchEvent { slot, pitch, rms: level });
            }
        }
    }

    state.running.store(false, Ordering::SeqCst);
    info!("[mic] slot {slot} stopped: {name}");
}
