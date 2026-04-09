/// Multi-channel audio output system using cpal
/// Enables routing vocals and instrumental to specific output channels
/// e.g., vocals to outputs 1-2, instrumental to outputs 3-4

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use crossbeam_channel::{Receiver, Sender};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tracing::{error, info, warn};

// Global player instance
static PLAYER: Lazy<Mutex<MultiChannelPlayer>> = Lazy::new(|| Mutex::new(MultiChannelPlayer::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputDevice {
    pub name: String,
    pub max_channels: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelRouting {
    pub device_name: String,
    pub start_channel: usize, // 0-indexed: 0 = channels 1-2, 2 = channels 3-4, etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiChannelConfig {
    pub vocals_routing: ChannelRouting,
    pub instrumental_routing: ChannelRouting,
}

pub struct MultiChannelPlayer {
    playing: Arc<AtomicBool>,
    position: Arc<Mutex<f64>>, // Current playback position in seconds
    vocals_stream: Option<Stream>,
    instrumental_stream: Option<Stream>,
    control_tx: Option<Sender<PlayerCommand>>,
}

enum PlayerCommand {
    Stop,
    Seek(f64),
}

/// Get display name for an audio device
fn device_display_name(device: &Device) -> String {
    let Ok(desc) = device.description() else {
        return "(unknown)".into();
    };
    if let Some(friendly) = desc.extended().first() {
        return friendly.clone();
    }
    desc.to_string()
}

/// List all available audio output devices with channel counts
#[tauri::command]
pub fn get_audio_output_devices() -> Result<Vec<AudioOutputDevice>, String> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    for device in host.output_devices().map_err(|e| e.to_string())? {
        let name = device_display_name(&device);
        // Get supported output configs to determine max channels
        if let Ok(mut configs) = device.supported_output_configs() {
            let max_channels = configs
                .try_fold(0, |max, config| {
                    Ok::<usize, cpal::SupportedStreamConfigsError>(
                        max.max(config.channels() as usize)
                    )
                })
                .unwrap_or(2);

            devices.push(AudioOutputDevice {
                name,
                max_channels,
            });
        }
    }

    Ok(devices)
}

impl MultiChannelPlayer {
    pub fn new() -> Self {
        Self {
            playing: Arc::new(AtomicBool::new(false)),
            position: Arc::new(Mutex::new(0.0)),
            vocals_stream: None,
            instrumental_stream: None,
            control_tx: None,
        }
    }

    /// Start playback with multi-channel routing
    pub fn play(
        &mut self,
        vocals_path: &str,
        instrumental_path: &str,
        config: MultiChannelConfig,
    ) -> Result<(), String> {
        eprintln!("[MULTI_CHANNEL] Starting playback:");
        eprintln!("[MULTI_CHANNEL]   Vocals file: {}", vocals_path);
        eprintln!("[MULTI_CHANNEL]   Vocals device: '{}', channels {}-{}", 
              config.vocals_routing.device_name,
              config.vocals_routing.start_channel,
              config.vocals_routing.start_channel + 1);
        eprintln!("[MULTI_CHANNEL]   Instrumental file: {}", instrumental_path);
        eprintln!("[MULTI_CHANNEL]   Instrumental device: '{}', channels {}-{}",
              config.instrumental_routing.device_name,
              config.instrumental_routing.start_channel,
              config.instrumental_routing.start_channel + 1);

        info!("[MULTI_CHANNEL] Starting playback:");
        info!("[MULTI_CHANNEL]   Vocals file: {}", vocals_path);
        info!("[MULTI_CHANNEL]   Vocals device: '{}', channels {}-{}", 
              config.vocals_routing.device_name,
              config.vocals_routing.start_channel,
              config.vocals_routing.start_channel + 1);
        info!("[MULTI_CHANNEL]   Instrumental file: {}", instrumental_path);
        info!("[MULTI_CHANNEL]   Instrumental device: '{}', channels {}-{}",
              config.instrumental_routing.device_name,
              config.instrumental_routing.start_channel,
              config.instrumental_routing.start_channel + 1);

        self.stop();

        let host = cpal::default_host();
        
        // Find devices
        let vocals_device = find_device_by_name(&host, &config.vocals_routing.device_name)?;
        let instrumental_device = find_device_by_name(&host, &config.instrumental_routing.device_name)?;

        // Create control channel
        let (tx, rx) = crossbeam_channel::unbounded();
        self.control_tx = Some(tx);

        let playing = Arc::clone(&self.playing);
        let position = Arc::clone(&self.position);
        
        playing.store(true, Ordering::Relaxed);

        // Check if both vocals and instrumental are going to the same device
        let same_device = config.vocals_routing.device_name == config.instrumental_routing.device_name;

        if same_device {
            eprintln!("[MULTI_CHANNEL] *** SAME DEVICE DETECTED *** - creating combined stream");
            eprintln!(
                "[MULTI_CHANNEL] Combined stream: vocals channels {}-{}, instrumental channels {}-{}",
                config.vocals_routing.start_channel,
                config.vocals_routing.start_channel + 1,
                config.instrumental_routing.start_channel,
                config.instrumental_routing.start_channel + 1
            );
            info!("[MULTI_CHANNEL] SAME DEVICE detected - creating combined stream");
            info!(
                "[MULTI_CHANNEL] Combined stream: vocals channels {}-{}, instrumental channels {}-{}",
                config.vocals_routing.start_channel,
                config.vocals_routing.start_channel + 1,
                config.instrumental_routing.start_channel,
                config.instrumental_routing.start_channel + 1
            );

            // Create a single combined stream for both vocals and instrumental
            let combined_stream = create_combined_audio_stream(
                &vocals_device,
                vocals_path,
                instrumental_path,
                config.vocals_routing.start_channel,
                config.instrumental_routing.start_channel,
                Arc::clone(&playing),
                Arc::clone(&position),
                rx,
            )?;

            combined_stream.play().map_err(|e| e.to_string())?;
            self.vocals_stream = Some(combined_stream);
            self.instrumental_stream = None;
        } else {
            eprintln!("[MULTI_CHANNEL] *** DIFFERENT DEVICES DETECTED *** - creating separate streams");
            eprintln!(
                "[MULTI_CHANNEL] Vocals stream: device='{}' channels {}-{}",
                config.vocals_routing.device_name,
                config.vocals_routing.start_channel,
                config.vocals_routing.start_channel + 1
            );
            eprintln!(
                "[MULTI_CHANNEL] Instrumental stream: device='{}' channels {}-{}",
                config.instrumental_routing.device_name,
                config.instrumental_routing.start_channel,
                config.instrumental_routing.start_channel + 1
            );
            info!("[MULTI_CHANNEL] DIFFERENT DEVICES detected - creating separate streams");
            info!(
                "[MULTI_CHANNEL] Vocals stream: device='{}' channels {}-{}",
                config.vocals_routing.device_name,
                config.vocals_routing.start_channel,
                config.vocals_routing.start_channel + 1
            );
            info!(
                "[MULTI_CHANNEL] Instrumental stream: device='{}' channels {}-{}",
                config.instrumental_routing.device_name,
                config.instrumental_routing.start_channel,
                config.instrumental_routing.start_channel + 1
            );

            // Start vocals stream
            let vocals_stream = create_audio_stream(
                &vocals_device,
                vocals_path,
                config.vocals_routing.start_channel,
                Arc::clone(&playing),
                Arc::clone(&position),
                rx,
            )?;

            // Create separate control channel for instrumental
            let (instrumental_tx, instrumental_rx) = crossbeam_channel::unbounded();
            
            // Start instrumental stream with separate position tracker
            let instrumental_position = Arc::new(Mutex::new(0.0));
            let instrumental_stream = create_audio_stream(
                &instrumental_device,
                instrumental_path,
                config.instrumental_routing.start_channel,
                Arc::clone(&playing),
                Arc::clone(&instrumental_position),
                instrumental_rx,
            )?;

            info!("[MULTI_CHANNEL] Starting vocals stream...");
            vocals_stream.play().map_err(|e| e.to_string())?;
            info!("[MULTI_CHANNEL] Vocals stream started successfully");
            
            info!("[MULTI_CHANNEL] Starting instrumental stream...");
            instrumental_stream.play().map_err(|e| e.to_string())?;
            info!("[MULTI_CHANNEL] Instrumental stream started successfully");

            self.vocals_stream = Some(vocals_stream);
            self.instrumental_stream = Some(instrumental_stream);
            self.control_tx = Some(instrumental_tx);
        }

        Ok(())
    }

    pub fn stop(&mut self) {
        self.playing.store(false, Ordering::Relaxed);
        
        if let Some(tx) = &self.control_tx {
            let _ = tx.send(PlayerCommand::Stop);
        }

        self.vocals_stream = None;
        self.instrumental_stream = None;
        self.control_tx = None;
        
        *self.position.lock().unwrap() = 0.0;
    }

    pub fn get_position(&self) -> f64 {
        *self.position.lock().unwrap()
    }

    pub fn seek(&self, time: f64) -> Result<(), String> {
        if let Some(tx) = &self.control_tx {
            tx.send(PlayerCommand::Seek(time))
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

fn find_device_by_name(host: &cpal::Host, name: &str) -> Result<Device, String> {
    host.output_devices()
        .map_err(|e| e.to_string())?
        .find(|d| device_display_name(d) == name)
        .ok_or_else(|| format!("Device not found: {}", name))
}

fn create_audio_stream(
    device: &Device,
    audio_path: &str,
    start_channel: usize,
    playing: Arc<AtomicBool>,
    position: Arc<Mutex<f64>>,
    control_rx: Receiver<PlayerCommand>,
) -> Result<Stream, String> {
    // Get supported config
    let supported_config = device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let sample_rate = supported_config.sample_rate();
    let channels = supported_config.channels() as usize;

    eprintln!(
        "[STREAM] Creating stream for device '{}': {} total channels, routing to channels {}-{}",
        device_display_name(device), channels, start_channel, start_channel + 1
    );
    eprintln!("[STREAM] Audio file: {}", audio_path);
    info!(
        "[STREAM] Creating stream for device '{}': {} total channels, routing to channels {}-{}",
        device_display_name(device), channels, start_channel, start_channel + 1
    );
    info!("[STREAM] Audio file: {}", audio_path);

    // Ensure we have enough channels for the routing
    if start_channel + 2 > channels {
        return Err(format!(
            "Device only has {} channels, cannot route to channels {}-{}",
            channels,
            start_channel + 1,
            start_channel + 2
        ));
    }

    // Decode audio file
    info!("[STREAM] Decoding audio file...");
    let audio_samples = decode_audio_file(audio_path, sample_rate.into())?;
    info!("[STREAM] Decoded {} stereo samples", audio_samples.len() / 2);
    let audio_data = Arc::new(Mutex::new(AudioBuffer {
        samples: audio_samples,
        position: 0,
    }));

    let config = StreamConfig {
        channels: channels as u16,
        sample_rate,
        buffer_size: cpal::BufferSize::Default,
    };

    let audio_data_clone = Arc::clone(&audio_data);
    let playing_clone = Arc::clone(&playing);
    let position_clone = Arc::clone(&position);

    // Create output callback
    let stream = match supported_config.sample_format() {
        SampleFormat::F32 => device.build_output_stream(
            &config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                write_audio_data_f32(
                    data,
                    channels,
                    start_channel,
                    &audio_data_clone,
                    &playing_clone,
                    &position_clone,
                    sample_rate,
                    &control_rx,
                );
            },
            |err| error!("Audio stream error: {}", err),
            None,
        ),
        SampleFormat::I16 => device.build_output_stream(
            &config,
            move |data: &mut [i16], _: &cpal::OutputCallbackInfo| {
                write_audio_data_i16(
                    data,
                    channels,
                    start_channel,
                    &audio_data_clone,
                    &playing_clone,
                    &position_clone,
                    sample_rate,
                    &control_rx,
                );
            },
            |err| error!("Audio stream error: {}", err),
            None,
        ),
        SampleFormat::U16 => device.build_output_stream(
            &config,
            move |data: &mut [u16], _: &cpal::OutputCallbackInfo| {
                write_audio_data_u16(
                    data,
                    channels,
                    start_channel,
                    &audio_data_clone,
                    &playing_clone,
                    &position_clone,
                    sample_rate,
                    &control_rx,
                );
            },
            |err| error!("Audio stream error: {}", err),
            None,
        ),
        _ => return Err("Unsupported sample format".to_string()),
    }
    .map_err(|e| e.to_string())?;

    Ok(stream)
}

/// Create a combined audio stream for both vocals and instrumental on the same device
fn create_combined_audio_stream(
    device: &Device,
    vocals_path: &str,
    instrumental_path: &str,
    vocals_start_channel: usize,
    instrumental_start_channel: usize,
    playing: Arc<AtomicBool>,
    position: Arc<Mutex<f64>>,
    control_rx: Receiver<PlayerCommand>,
) -> Result<Stream, String> {
    // Get supported config
    let supported_config = device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let sample_rate = supported_config.sample_rate();
    let channels = supported_config.channels() as usize;

    info!(
        "Creating combined stream: {} channels, {} Hz, vocals: {}-{}, instrumental: {}-{}",
        channels, sample_rate,
        vocals_start_channel + 1, vocals_start_channel + 2,
        instrumental_start_channel + 1, instrumental_start_channel + 2
    );

    // Ensure we have enough channels for both routings
    if vocals_start_channel + 2 > channels || instrumental_start_channel + 2 > channels {
        return Err(format!(
            "Device only has {} channels, cannot route vocals to {}-{} and instrumental to {}-{}",
            channels,
            vocals_start_channel + 1, vocals_start_channel + 2,
            instrumental_start_channel + 1, instrumental_start_channel + 2
        ));
    }

    // Decode both audio files
    let vocals_samples = decode_audio_file(vocals_path, sample_rate)?;
    let instrumental_samples = decode_audio_file(instrumental_path, sample_rate)?;

    let vocals_data = Arc::new(Mutex::new(AudioBuffer {
        samples: vocals_samples,
        position: 0,
    }));

    let instrumental_data = Arc::new(Mutex::new(AudioBuffer {
        samples: instrumental_samples,
        position: 0,
    }));

    let config = StreamConfig {
        channels: channels as u16,
        sample_rate,
        buffer_size: cpal::BufferSize::Default,
    };

    let vocals_data_clone = Arc::clone(&vocals_data);
    let instrumental_data_clone = Arc::clone(&instrumental_data);
    let playing_clone = Arc::clone(&playing);
    let position_clone = Arc::clone(&position);

    // Create output callback
    let stream = match supported_config.sample_format() {
        SampleFormat::F32 => device.build_output_stream(
            &config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                write_combined_audio_data_f32(
                    data,
                    channels,
                    vocals_start_channel,
                    instrumental_start_channel,
                    &vocals_data_clone,
                    &instrumental_data_clone,
                    &playing_clone,
                    &position_clone,
                    sample_rate,
                    &control_rx,
                );
            },
            |err| error!("Audio stream error: {}", err),
            None,
        ),
        _ => return Err("Only F32 sample format supported for combined streams".to_string()),
    }
    .map_err(|e| e.to_string())?;

    Ok(stream)
}

struct AudioBuffer {
    samples: Vec<f32>, // Stereo interleaved: [L, R, L, R, ...]
    position: usize,
}

fn write_audio_data_f32(
    output: &mut [f32],
    total_channels: usize,
    start_channel: usize,
    audio_data: &Arc<Mutex<AudioBuffer>>,
    playing: &Arc<AtomicBool>,
    position: &Arc<Mutex<f64>>,
    sample_rate: u32,
    control_rx: &Receiver<PlayerCommand>,
) {
    // Check for commands
    while let Ok(cmd) = control_rx.try_recv() {
        match cmd {
            PlayerCommand::Stop => {
                playing.store(false, Ordering::Relaxed);
                return;
            }
            PlayerCommand::Seek(time) => {
                if let Ok(mut buffer) = audio_data.lock() {
                    buffer.position = (time * sample_rate as f64 * 2.0) as usize;
                }
            }
        }
    }

    if !playing.load(Ordering::Relaxed) {
        output.fill(0.0);
        return;
    }

    let mut buffer = match audio_data.lock() {
        Ok(b) => b,
        Err(_) => {
            output.fill(0.0);
            return;
        }
    };

    let frames = output.len() / total_channels;

    for frame_idx in 0..frames {
        // Calculate the position in the stereo buffer for this frame
        let stereo_frame_pos = buffer.position + (frame_idx * 2);
        
        // Check if we have enough samples
        if stereo_frame_pos + 1 >= buffer.samples.len() {
            // Reached end of audio, fill rest with silence
            for remaining_frame in frame_idx..frames {
                for ch in 0..total_channels {
                    output[remaining_frame * total_channels + ch] = 0.0;
                }
            }
            playing.store(false, Ordering::Relaxed);
            break;
        }
        
        // Get left and right samples from stereo buffer
        let left_sample = buffer.samples[stereo_frame_pos];
        let right_sample = buffer.samples[stereo_frame_pos + 1];
        
        // Write to all output channels
        for ch in 0..total_channels {
            let output_idx = frame_idx * total_channels + ch;
            
            // Only write to our designated channels (start_channel and start_channel+1)
            if ch == start_channel {
                // Left channel of stereo pair
                output[output_idx] = left_sample;
            } else if ch == start_channel + 1 {
                // Right channel of stereo pair
                output[output_idx] = right_sample;
            } else {
                // All other channels get silence
                output[output_idx] = 0.0;
            }
        }
    }
    
    // Update buffer position
    buffer.position += frames * 2; // Advance by number of stereo frames processed

    // Update position
    let time = buffer.position as f64 / (sample_rate as f64 * 2.0);
    *position.lock().unwrap() = time;
}

/// Write combined audio data (vocals + instrumental) to output buffer
fn write_combined_audio_data_f32(
    output: &mut [f32],
    total_channels: usize,
    vocals_start_channel: usize,
    instrumental_start_channel: usize,
    vocals_data: &Arc<Mutex<AudioBuffer>>,
    instrumental_data: &Arc<Mutex<AudioBuffer>>,
    playing: &Arc<AtomicBool>,
    position: &Arc<Mutex<f64>>,
    sample_rate: u32,
    control_rx: &Receiver<PlayerCommand>,
) {
    // Check for commands
    while let Ok(cmd) = control_rx.try_recv() {
        match cmd {
            PlayerCommand::Stop => {
                playing.store(false, Ordering::Relaxed);
                return;
            }
            PlayerCommand::Seek(time) => {
                let seek_pos = (time * sample_rate as f64 * 2.0) as usize;
                if let Ok(mut vocals_buf) = vocals_data.lock() {
                    vocals_buf.position = seek_pos;
                }
                if let Ok(mut instrumental_buf) = instrumental_data.lock() {
                    instrumental_buf.position = seek_pos;
                }
            }
        }
    }

    if !playing.load(Ordering::Relaxed) {
        output.fill(0.0);
        return;
    }

    let mut vocals_buffer = match vocals_data.lock() {
        Ok(b) => b,
        Err(_) => {
            output.fill(0.0);
            return;
        }
    };

    let mut instrumental_buffer = match instrumental_data.lock() {
        Ok(b) => b,
        Err(_) => {
            output.fill(0.0);
            return;
        }
    };

    let frames = output.len() / total_channels;

    for frame_idx in 0..frames {
        // Calculate positions in both buffers
        let vocals_stereo_pos = vocals_buffer.position + (frame_idx * 2);
        let instrumental_stereo_pos = instrumental_buffer.position + (frame_idx * 2);
        
        // Check if we've reached the end of either track
        let vocals_ended = vocals_stereo_pos + 1 >= vocals_buffer.samples.len();
        let instrumental_ended = instrumental_stereo_pos + 1 >= instrumental_buffer.samples.len();
        
        if vocals_ended && instrumental_ended {
            // Both tracks ended, fill rest with silence
            for remaining_frame in frame_idx..frames {
                for ch in 0..total_channels {
                    output[remaining_frame * total_channels + ch] = 0.0;
                }
            }
            playing.store(false, Ordering::Relaxed);
            break;
        }
        
        // Get samples from both tracks
        let (vocals_left, vocals_right) = if !vocals_ended {
            (
                vocals_buffer.samples[vocals_stereo_pos],
                vocals_buffer.samples[vocals_stereo_pos + 1],
            )
        } else {
            (0.0, 0.0)
        };
        
        let (instrumental_left, instrumental_right) = if !instrumental_ended {
            (
                instrumental_buffer.samples[instrumental_stereo_pos],
                instrumental_buffer.samples[instrumental_stereo_pos + 1],
            )
        } else {
            (0.0, 0.0)
        };
        
        // Write to all output channels
        for ch in 0..total_channels {
            let output_idx = frame_idx * total_channels + ch;
            
            // Route vocals to its channels
            if ch == vocals_start_channel {
                output[output_idx] = vocals_left;
            } else if ch == vocals_start_channel + 1 {
                output[output_idx] = vocals_right;
            }
            // Route instrumental to its channels
            else if ch == instrumental_start_channel {
                output[output_idx] = instrumental_left;
            } else if ch == instrumental_start_channel + 1 {
                output[output_idx] = instrumental_right;
            }
            // All other channels get silence
            else {
                output[output_idx] = 0.0;
            }
        }
    }
    
    // Update buffer positions
    vocals_buffer.position += frames * 2;
    instrumental_buffer.position += frames * 2;

    // Update position (use vocals position as reference)
    let time = vocals_buffer.position as f64 / (sample_rate as f64 * 2.0);
    *position.lock().unwrap() = time;
}

fn write_audio_data_i16(
    output: &mut [i16],
    total_channels: usize,
    start_channel: usize,
    audio_data: &Arc<Mutex<AudioBuffer>>,
    playing: &Arc<AtomicBool>,
    position: &Arc<Mutex<f64>>,
    sample_rate: u32,
    control_rx: &Receiver<PlayerCommand>,
) {
    let mut temp_f32 = vec![0.0f32; output.len()];
    write_audio_data_f32(
        &mut temp_f32,
        total_channels,
        start_channel,
        audio_data,
        playing,
        position,
        sample_rate,
        control_rx,
    );
    for (i, sample) in temp_f32.iter().enumerate() {
        output[i] = (sample * 32767.0) as i16;
    }
}

fn write_audio_data_u16(
    output: &mut [u16],
    total_channels: usize,
    start_channel: usize,
    audio_data: &Arc<Mutex<AudioBuffer>>,
    playing: &Arc<AtomicBool>,
    position: &Arc<Mutex<f64>>,
    sample_rate: u32,
    control_rx: &Receiver<PlayerCommand>,
) {
    let mut temp_f32 = vec![0.0f32; output.len()];
    write_audio_data_f32(
        &mut temp_f32,
        total_channels,
        start_channel,
        audio_data,
        playing,
        position,
        sample_rate,
        control_rx,
    );
    for (i, sample) in temp_f32.iter().enumerate() {
        output[i] = ((sample + 1.0) * 32767.5) as u16;
    }
}

fn decode_audio_file(path: &str, target_sample_rate: cpal::SampleRate) -> Result<Vec<f32>, String> {
    info!("[DECODE] Decoding audio file: {}", path);

    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = Path::new(path).extension() {
        hint.with_extension(ext.to_str().unwrap_or(""));
    }

    let format_opts = FormatOptions::default();
    let metadata_opts = MetadataOptions::default();
    let decoder_opts = DecoderOptions::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &metadata_opts)
        .map_err(|e| format!("Failed to probe file: {}", e))?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or("No default track found")?;
    
    let source_sample_rate = track.codec_params.sample_rate.unwrap_or(48000);
    let target_sr_u32: u32 = target_sample_rate.into();
    info!("[DECODE] Source sample rate: {} Hz, target sample rate: {} Hz", source_sample_rate, target_sr_u32);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &decoder_opts)
        .map_err(|e| format!("Failed to create decoder: {}", e))?;

    let track_id = track.id;
    let mut samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let duration = decoded.capacity() as u64;
                
                let mut sample_buf = SampleBuffer::<f32>::new(duration, spec);
                sample_buf.copy_interleaved_ref(decoded);
                
                let audio_samples = sample_buf.samples();
                
                // Convert to stereo if needed
                match spec.channels.count() {
                    1 => {
                        // Mono to stereo: duplicate samples
                        for &sample in audio_samples {
                            samples.push(sample);
                            samples.push(sample);
                        }
                    }
                    2 => {
                        // Already stereo
                        samples.extend_from_slice(audio_samples);
                    }
                    _ => {
                        // Multi-channel: downmix to stereo (simple average)
                        let channels = spec.channels.count();
                        for chunk in audio_samples.chunks(channels) {
                            let left: f32 = chunk.iter().step_by(2).sum::<f32>() / (channels / 2) as f32;
                            let right: f32 = chunk.iter().skip(1).step_by(2).sum::<f32>() / (channels / 2) as f32;
                            samples.push(left);
                            samples.push(right);
                        }
                    }
                }
            }
            Err(e) => warn!("Decode error: {}", e),
        }
    }

    info!("[DECODE] Decoded {} stereo samples at {} Hz", samples.len() / 2, source_sample_rate);
    
    // Resample if needed
    if source_sample_rate != target_sr_u32 {
        info!("[DECODE] Resampling from {} Hz to {} Hz (using fast linear interpolation)...", source_sample_rate, target_sr_u32);
        
        // Use simple linear interpolation for speed
        let ratio = target_sr_u32 as f64 / source_sample_rate as f64;
        let input_frames = samples.len() / 2;
        let output_frames = (input_frames as f64 * ratio).ceil() as usize;
        let mut resampled = Vec::with_capacity(output_frames * 2);
        
        for out_frame in 0..output_frames {
            let in_pos = out_frame as f64 / ratio;
            let in_frame = in_pos as usize;
            let frac = in_pos - in_frame as f64;
            
            if in_frame + 1 < input_frames {
                // Linear interpolation between samples
                let in_idx = in_frame * 2;
                let next_idx = (in_frame + 1) * 2;
                
                let left = samples[in_idx] * (1.0 - frac as f32) + samples[next_idx] * frac as f32;
                let right = samples[in_idx + 1] * (1.0 - frac as f32) + samples[next_idx + 1] * frac as f32;
                
                resampled.push(left);
                resampled.push(right);
            } else if in_frame < input_frames {
                // Last sample, no interpolation
                let in_idx = in_frame * 2;
                resampled.push(samples[in_idx]);
                resampled.push(samples[in_idx + 1]);
            }
        }
        
        info!("[DECODE] Resampled to {} stereo samples in {:.2}s", resampled.len() / 2, 0.0);
        Ok(resampled)
    } else {
        info!("[DECODE] No resampling needed");
        Ok(samples)
    }
}

// ============================================================================
// Tauri Commands for Multi-Channel Playback Control
// ============================================================================

#[tauri::command]
pub fn start_multi_channel_playback(
    vocals_path: String,
    instrumental_path: String,
    config: MultiChannelConfig,
) -> Result<(), String> {
    eprintln!("\n========== MULTI-CHANNEL PLAYBACK START ==========");
    eprintln!("Vocals file: {}", vocals_path);
    eprintln!("Instrumental file: {}", instrumental_path);
    eprintln!("Vocals device: '{}', channels {}-{}", config.vocals_routing.device_name, config.vocals_routing.start_channel, config.vocals_routing.start_channel + 1);
    eprintln!("Instrumental device: '{}', channels {}-{}", config.instrumental_routing.device_name, config.instrumental_routing.start_channel, config.instrumental_routing.start_channel + 1);
    eprintln!("===================================================\n");
    
    info!("Starting multi-channel playback: vocals={}, instrumental={}", vocals_path, instrumental_path);
    
    let mut player = PLAYER.lock().map_err(|e| format!("Failed to lock player: {}", e))?;
    player.play(&vocals_path, &instrumental_path, config)
}

#[tauri::command]
pub fn stop_multi_channel_playback() -> Result<(), String> {
    info!("Stopping multi-channel playback");
    
    let mut player = PLAYER.lock().map_err(|e| format!("Failed to lock player: {}", e))?;
    player.stop();
    Ok(())
}

#[tauri::command]
pub fn seek_multi_channel_playback(time: f64) -> Result<(), String> {
    let player = PLAYER.lock().map_err(|e| format!("Failed to lock player: {}", e))?;
    player.seek(time)
}

#[tauri::command]
pub fn get_multi_channel_playback_position() -> Result<f64, String> {
    let player = PLAYER.lock().map_err(|e| format!("Failed to lock player: {}", e))?;
    Ok(player.get_position())
}

#[tauri::command]
pub fn is_multi_channel_playback_active() -> Result<bool, String> {
    let player = PLAYER.lock().map_err(|e| format!("Failed to lock player: {}", e))?;
    Ok(player.playing.load(Ordering::Relaxed))
}
