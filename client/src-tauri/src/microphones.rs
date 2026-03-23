use cpal::device_description::DeviceType;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use pitch_detection::detector::mcleod::McLeodDetector;
use pitch_detection::detector::PitchDetector;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

const PITCH_WINDOW: usize = 2048;
const MIN_PITCH_HZ: f32 = 80.0;
const MAX_PITCH_HZ: f32 = 1000.0;
const PITCH_POWER_THRESHOLD: f32 = 0.2;
const PITCH_CLARITY_THRESHOLD: f32 = 0.4;
const MIC_RMS_GATE: f32 = 0.012;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MicrophoneInfo {
    pub name: String,
}

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

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

#[derive(Debug, Clone, Serialize)]
struct MicPitchEvent {
    pitch: Option<f32>,
}

static MIC_RUNNING: AtomicBool = AtomicBool::new(false);
static MIC_SHUTDOWN: once_cell::sync::Lazy<Arc<AtomicBool>> =
    once_cell::sync::Lazy::new(|| Arc::new(AtomicBool::new(false)));

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

#[tauri::command]
pub fn start_mic_capture(app: AppHandle, preferred: Option<String>) -> Result<String, String> {
    if MIC_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok("already running".into());
    }

    MIC_SHUTDOWN.store(false, Ordering::SeqCst);

    let (device, name) = find_device(preferred.as_deref()).map_err(|e| {
        MIC_RUNNING.store(false, Ordering::SeqCst);
        e
    })?;

    let device_name = name.clone();
    let shutdown = Arc::clone(&MIC_SHUTDOWN);

    std::thread::spawn(move || {
        run_mic_loop(device, &name, app, shutdown);
        MIC_RUNNING.store(false, Ordering::SeqCst);
    });

    Ok(device_name)
}

fn try_build_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    shared: Arc<Mutex<VecDeque<f32>>>,
) -> Option<cpal::Stream> {
    let ch = config.channels as usize;
    let push_samples: Arc<dyn Fn(&[f32]) + Send + Sync> = {
        let shared_cb = Arc::clone(&shared);
        Arc::new(move |data: &[f32]| {
            if let Ok(mut q) = shared_cb.try_lock() {
                for chunk in data.chunks(ch) {
                    let mono = chunk.iter().sum::<f32>() / ch as f32;
                    q.push_back(mono);
                }
                while q.len() > PITCH_WINDOW * 2 {
                    q.pop_front();
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
                |err| eprintln!("[mic] stream error: {err}"),
                None,
            )
        }
        SampleFormat::I16 => {
            let push = push_samples.clone();
            device.build_input_stream(
                config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let floats: Vec<f32> =
                        data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
                    push(&floats);
                },
                |err| eprintln!("[mic] stream error: {err}"),
                None,
            )
        }
        SampleFormat::I32 => {
            let push = push_samples.clone();
            device.build_input_stream(
                config,
                move |data: &[i32], _: &cpal::InputCallbackInfo| {
                    let floats: Vec<f32> =
                        data.iter().map(|&s| s as f32 / i32::MAX as f32).collect();
                    push(&floats);
                },
                |err| eprintln!("[mic] stream error: {err}"),
                None,
            )
        }
        _ => return None,
    };

    let stream = match stream {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mic] build stream failed: {e}");
            return None;
        }
    };

    if let Err(e) = stream.play() {
        eprintln!("[mic] play failed: {e}");
        return None;
    }

    Some(stream)
}

fn run_mic_loop(device: cpal::Device, name: &str, app: AppHandle, shutdown: Arc<AtomicBool>) {
    let default_cfg = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[mic] '{name}' config error: {e}");
            return;
        }
    };

    let sample_format = default_cfg.sample_format();
    let config = cpal::StreamConfig {
        channels: default_cfg.channels(),
        sample_rate: default_cfg.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };
    let sr = config.sample_rate as usize;

    eprintln!(
        "[mic] opening '{name}': {sr} Hz, {}ch, {sample_format:?}",
        config.channels
    );

    let shared = Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(PITCH_WINDOW * 2)));
    let Some(_stream) = try_build_stream(&device, &config, sample_format, Arc::clone(&shared))
    else {
        eprintln!("[mic] failed to open '{name}'");
        return;
    };

    eprintln!("[mic] active: {name}");

    let mut detector = McLeodDetector::new(PITCH_WINDOW, PITCH_WINDOW / 2);
    let sleep_dur = std::time::Duration::from_millis(25);

    loop {
        std::thread::sleep(sleep_dur);

        if shutdown.load(Ordering::Relaxed) {
            break;
        }

        let window = {
            let Ok(q) = shared.lock() else { break };
            if q.len() < PITCH_WINDOW {
                continue;
            }
            let start = q.len() - PITCH_WINDOW;
            q.range(start..).copied().collect::<Vec<_>>()
        };

        let pitch = if rms(&window) < MIC_RMS_GATE {
            None
        } else {
            detector
                .get_pitch(&window, sr, PITCH_POWER_THRESHOLD, PITCH_CLARITY_THRESHOLD)
                .filter(|p| p.frequency >= MIN_PITCH_HZ && p.frequency <= MAX_PITCH_HZ)
                .map(|p| p.frequency)
        };

        let _ = app.emit("mic-pitch", MicPitchEvent { pitch });
    }
}

#[tauri::command]
pub fn stop_mic_capture() {
    MIC_SHUTDOWN.store(true, Ordering::SeqCst);
}
