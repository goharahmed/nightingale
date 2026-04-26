use std::fs::File;
use std::path::{Path, PathBuf};

use ogg::writing::PacketWriteEndInfo;
use tracing::{debug, info, warn};

use crate::cache::CacheDir;

const OPUS_SAMPLE_RATE: u32 = 48_000;
const OPUS_CHANNELS: u32 = 1;
const OPUS_FRAME_SAMPLES: usize = 240; // 5ms at 48kHz
const OPUS_BITRATE: i32 = 128_000;

/// Discover which stems exist for a song and return (stem_id, mp3_path) pairs.
pub fn discover_stems(cache: &CacheDir, file_hash: &str) -> Vec<(String, PathBuf)> {
    let mut stems = Vec::new();

    let inst = cache.instrumental_path(file_hash);
    if inst.is_file() {
        stems.push(("instrumental".to_string(), inst));
    }

    let voc = cache.vocals_path(file_hash);
    if voc.is_file() {
        stems.push(("vocals".to_string(), voc));
    }

    let male = cache.path.join(format!("{file_hash}_male_vocals.mp3"));
    if male.is_file() {
        stems.push(("male_vocals".to_string(), male));
    }

    let female = cache.path.join(format!("{file_hash}_female_vocals.mp3"));
    if female.is_file() {
        stems.push(("female_vocals".to_string(), female));
    }

    stems
}

/// Ensure all stems are transcoded to Opus and cached. Returns paths to the .opus files.
pub fn ensure_opus_stems(
    cache: &CacheDir,
    file_hash: &str,
    stems: &[(String, PathBuf)],
) -> Result<Vec<(String, PathBuf)>, String> {
    let mut opus_paths = Vec::new();

    for (stem_id, mp3_path) in stems {
        let opus_path = cache.iem_stem_path(file_hash, stem_id);
        if !opus_path.is_file() {
            info!("transcoding {stem_id} for {file_hash}");
            transcode_mp3_to_opus(mp3_path, &opus_path)?;
        }
        opus_paths.push((stem_id.clone(), opus_path));
    }

    Ok(opus_paths)
}

/// Read all Opus frames from an Ogg Opus file into memory.
pub fn read_opus_frames(path: &Path) -> Result<Vec<Vec<u8>>, String> {
    let file = File::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
    let mut reader = ogg::reading::PacketReader::new(file);
    let mut frames = Vec::new();
    let mut skipped_headers = 0u32;

    loop {
        match reader.read_packet() {
            Ok(Some(packet)) => {
                // Skip the first two packets (OpusHead + OpusTags)
                if skipped_headers < 2 {
                    skipped_headers += 1;
                    continue;
                }
                frames.push(packet.data);
            }
            Ok(None) => break,
            Err(e) => return Err(format!("read ogg packet from {}: {e}", path.display())),
        }
    }

    debug!("read {} Opus frames from {}", frames.len(), path.display());
    Ok(frames)
}

fn transcode_mp3_to_opus(mp3_path: &Path, opus_path: &Path) -> Result<(), String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let file = File::open(mp3_path)
        .map_err(|e| format!("open {}: {e}", mp3_path.display()))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    hint.with_extension("mp3");

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("probe {}: {e}", mp3_path.display()))?;

    let mut format_reader = probed.format;
    let track = format_reader
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("no audio track in MP3")?;
    let track_id = track.id;

    let source_rate = track
        .codec_params
        .sample_rate
        .ok_or("MP3 has no sample rate")?;
    let source_channels = track
        .codec_params
        .channels
        .map(|c| c.count())
        .unwrap_or(2);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("create MP3 decoder: {e}"))?;

    // Collect all PCM as f32 mono
    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format_reader.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => {
                warn!("MP3 decode packet error (skipping): {e}");
                continue;
            }
        };
        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(e) => {
                warn!("MP3 decode frame error (skipping): {e}");
                continue;
            }
        };

        let spec = *decoded.spec();
        let n_frames = decoded.frames();
        let mut sample_buf = SampleBuffer::<f32>::new(n_frames as u64, spec);
        sample_buf.copy_interleaved_ref(decoded);
        let interleaved = sample_buf.samples();

        // Downmix to mono
        for frame_idx in 0..n_frames {
            let mut sum = 0.0f32;
            for ch in 0..source_channels {
                sum += interleaved[frame_idx * source_channels + ch];
            }
            all_samples.push(sum / source_channels as f32);
        }
    }

    // Resample to 48kHz if needed
    let mono_48k = if source_rate != OPUS_SAMPLE_RATE {
        resample(&all_samples, source_rate, OPUS_SAMPLE_RATE)?
    } else {
        all_samples
    };

    // Encode to Opus and write to Ogg
    encode_opus_to_ogg(&mono_48k, opus_path)?;

    info!(
        "transcoded {} -> {} ({} samples at 48kHz)",
        mp3_path.display(),
        opus_path.display(),
        mono_48k.len()
    );
    Ok(())
}

fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Result<Vec<f32>, String> {
    use rubato::{FftFixedIn, Resampler};

    let ratio = to_rate as f64 / from_rate as f64;
    let chunk_size = 1024;
    let mut resampler = FftFixedIn::<f32>::new(
        from_rate as usize,
        to_rate as usize,
        chunk_size,
        1, // sub-chunks
        1, // channels (mono)
    )
    .map_err(|e| format!("create resampler: {e}"))?;

    let mut output = Vec::with_capacity((samples.len() as f64 * ratio * 1.1) as usize);
    let mut pos = 0;

    while pos + chunk_size <= samples.len() {
        let input = vec![samples[pos..pos + chunk_size].to_vec()];
        let resampled = resampler.process(&input, None)
            .map_err(|e| format!("resample: {e}"))?;
        output.extend_from_slice(&resampled[0]);
        pos += chunk_size;
    }

    // Handle remaining samples by zero-padding
    if pos < samples.len() {
        let remaining = samples.len() - pos;
        let mut padded = vec![0.0f32; chunk_size];
        padded[..remaining].copy_from_slice(&samples[pos..]);
        let input = vec![padded];
        let resampled = resampler.process(&input, None)
            .map_err(|e| format!("resample tail: {e}"))?;
        let keep = (remaining as f64 * ratio).ceil() as usize;
        let take = keep.min(resampled[0].len());
        output.extend_from_slice(&resampled[0][..take]);
    }

    Ok(output)
}

fn encode_opus_to_ogg(samples: &[f32], path: &Path) -> Result<(), String> {
    let mut encoder = opus::Encoder::new(
        OPUS_SAMPLE_RATE,
        opus::Channels::Mono,
        opus::Application::Audio,
    )
    .map_err(|e| format!("create Opus encoder: {e}"))?;
    encoder
        .set_bitrate(opus::Bitrate::Bits(OPUS_BITRATE))
        .map_err(|e| format!("set Opus bitrate: {e}"))?;

    let lookahead = encoder.get_lookahead().unwrap_or(312) as u16;

    let file = File::create(path).map_err(|e| format!("create {}: {e}", path.display()))?;
    let serial = rand::random::<u32>();
    let mut ogg_writer = ogg::writing::PacketWriter::new(file);

    // OpusHead header (RFC 7845)
    let mut opus_head = Vec::with_capacity(19);
    opus_head.extend_from_slice(b"OpusHead");
    opus_head.push(1); // version
    opus_head.push(OPUS_CHANNELS as u8);
    opus_head.extend_from_slice(&lookahead.to_le_bytes());
    opus_head.extend_from_slice(&OPUS_SAMPLE_RATE.to_le_bytes());
    opus_head.extend_from_slice(&0u16.to_le_bytes()); // output gain
    opus_head.push(0); // mapping family

    ogg_writer
        .write_packet(opus_head, serial, PacketWriteEndInfo::EndPage, 0)
        .map_err(|e| format!("write OpusHead: {e}"))?;

    // OpusTags header
    let vendor = b"nightingale";
    let mut opus_tags = Vec::new();
    opus_tags.extend_from_slice(b"OpusTags");
    opus_tags.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    opus_tags.extend_from_slice(vendor);
    opus_tags.extend_from_slice(&0u32.to_le_bytes()); // no user comments

    ogg_writer
        .write_packet(opus_tags, serial, PacketWriteEndInfo::EndPage, 0)
        .map_err(|e| format!("write OpusTags: {e}"))?;

    // Encode and write audio packets
    let mut out_buf = vec![0u8; 4000];
    let mut granulepos: u64 = 0;
    let total_frames = (samples.len() + OPUS_FRAME_SAMPLES - 1) / OPUS_FRAME_SAMPLES;

    for i in 0..total_frames {
        let start = i * OPUS_FRAME_SAMPLES;
        let end = (start + OPUS_FRAME_SAMPLES).min(samples.len());
        let mut frame = [0.0f32; OPUS_FRAME_SAMPLES];
        frame[..end - start].copy_from_slice(&samples[start..end]);

        let encoded_len = encoder
            .encode_float(&frame, &mut out_buf)
            .map_err(|e| format!("Opus encode frame {i}: {e}"))?;
        let encoded = out_buf[..encoded_len].to_vec();

        granulepos += OPUS_FRAME_SAMPLES as u64;
        let end_info = if i == total_frames - 1 {
            PacketWriteEndInfo::EndStream
        } else {
            PacketWriteEndInfo::NormalPacket
        };

        ogg_writer
            .write_packet(encoded, serial, end_info, granulepos)
            .map_err(|e| format!("write Opus frame {i}: {e}"))?;
    }

    Ok(())
}
