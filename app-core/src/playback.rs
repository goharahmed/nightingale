use std::path::{Path, PathBuf};

use rand::prelude::{IndexedRandom, SliceRandom};
use serde::Serialize;
use serde_json::Value;
use tracing::{info, warn};

use crate::cache::{CacheDir, normalize_tempo, videos_dir};
use crate::error::NightingaleError;
use crate::library_db;
use crate::song::Song;
use crate::vendor::{ffmpeg_path, silent_command};

#[derive(Debug, Clone, Serialize)]
pub struct AudioPaths {
    pub instrumental: String,
    pub vocals: String,
}

#[derive(Debug, Clone)]
pub struct ShiftResult {
    pub key: String,
    pub tempo: f64,
}

pub fn load_transcript(file_hash: &str) -> Result<serde_json::Value, NightingaleError> {
    let cache = CacheDir::new();
    let path = resolve_transcript_path(&cache, file_hash);
    let data = std::fs::read_to_string(&path)?;
    let value = serde_json::from_str(&data)?;
    Ok(value)
}

fn resolve_effective_key_tempo(song: &Song) -> Option<(String, f64)> {
    let key = song.override_key.as_ref().or(song.key.as_ref())?.clone();
    Some((key, normalize_tempo(song.tempo)))
}

fn is_base_original_selection(song: &Song, key: &str, tempo: f64) -> bool {
    song.key.as_deref() == Some(key) && normalize_tempo(tempo) == 1.0
}

fn legacy_pair_exists(cache: &CacheDir, file_hash: &str) -> bool {
    cache.instrumental_path(file_hash).is_file() && cache.vocals_path(file_hash).is_file()
}

fn variant_pair_exists(cache: &CacheDir, file_hash: &str, key: &str, tempo: f64) -> bool {
    cache
        .variant_instrumental_path(file_hash, key, tempo)
        .is_file()
        && cache.variant_vocals_path(file_hash, key, tempo).is_file()
}

fn resolve_transcript_path(cache: &CacheDir, file_hash: &str) -> PathBuf {
    if let Some(song) = library_db::load_song_by_hash(file_hash).ok().flatten() {
        if let Some((_key, tempo)) = resolve_effective_key_tempo(&song) {
            if normalize_tempo(tempo) == 1.0 {
                return cache.transcript_path(file_hash);
            }
            let variant = cache.variant_transcript_path(file_hash, tempo);
            if variant.is_file() {
                return variant;
            }
        }
    }
    cache.transcript_path(file_hash)
}

pub fn get_audio_paths(file_hash: &str) -> AudioPaths {
    let cache = CacheDir::new();
    if let Some(song) = library_db::load_song_by_hash(file_hash).ok().flatten() {
        let effective_key = song.override_key.as_ref().or(song.key.as_ref());
        let tempo = normalize_tempo(song.tempo);

        if let Some(key) = effective_key {
            let variant_instrumental = cache.variant_instrumental_path(file_hash, key, tempo);
            let variant_vocals = cache.variant_vocals_path(file_hash, key, tempo);
            if is_base_original_selection(&song, key, tempo) {
                if variant_instrumental.is_file() && variant_vocals.is_file() {
                    return AudioPaths {
                        instrumental: variant_instrumental.to_string_lossy().into_owned(),
                        vocals: variant_vocals.to_string_lossy().into_owned(),
                    };
                }
                let legacy_inst = cache.instrumental_path(file_hash);
                let legacy_voc = cache.vocals_path(file_hash);
                if legacy_inst.is_file() && legacy_voc.is_file() {
                    return AudioPaths {
                        instrumental: legacy_inst.to_string_lossy().into_owned(),
                        vocals: legacy_voc.to_string_lossy().into_owned(),
                    };
                }
            }
            if variant_instrumental.is_file() && variant_vocals.is_file() {
                return AudioPaths {
                    instrumental: variant_instrumental.to_string_lossy().into_owned(),
                    vocals: variant_vocals.to_string_lossy().into_owned(),
                };
            }
        }
    }

    let legacy_inst = cache.instrumental_path(file_hash);
    let legacy_voc = cache.vocals_path(file_hash);
    if legacy_inst.is_file() && legacy_voc.is_file() {
        return AudioPaths {
            instrumental: legacy_inst.to_string_lossy().into_owned(),
            vocals: legacy_voc.to_string_lossy().into_owned(),
        };
    }

    AudioPaths {
        instrumental: legacy_inst.to_string_lossy().into_owned(),
        vocals: legacy_voc.to_string_lossy().into_owned(),
    }
}

fn convert_ogg_to_mp3(ogg: &PathBuf, mp3: &PathBuf) -> Result<(), NightingaleError> {
    let status = silent_command(ffmpeg_path())
        .args(["-y", "-i"])
        .arg(ogg)
        .args(["-c:a", "libmp3lame", "-q:a", "2", "-v", "error"])
        .arg(mp3)
        .status()?;

    if !status.success() {
        return Err(NightingaleError::Other(format!(
            "ffmpeg exited with status {}",
            status
        )));
    }

    std::fs::remove_file(ogg).ok();
    Ok(())
}

fn run_rubberband_filter(
    input: &Path,
    output: &Path,
    pitch_ratio: f64,
    tempo_ratio: f64,
) -> Result<(), NightingaleError> {
    let filter = format!("rubberband=pitch={pitch_ratio}:tempo={tempo_ratio}");
    let status = silent_command(ffmpeg_path())
        .args(["-y", "-i"])
        .arg(input)
        .args([
            "-af",
            &filter,
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            "-v",
            "error",
        ])
        .arg(output)
        .status()?;
    if !status.success() {
        return Err(NightingaleError::Other(format!(
            "ffmpeg rubberband failed with status {status}"
        )));
    }
    Ok(())
}

fn run_rubberband_pair_parallel(
    source_inst: &Path,
    target_inst: &Path,
    source_voc: &Path,
    target_voc: &Path,
    pitch_ratio: f64,
    tempo_ratio: f64,
) -> Result<(), NightingaleError> {
    let source_inst = source_inst.to_path_buf();
    let target_inst = target_inst.to_path_buf();
    let source_voc = source_voc.to_path_buf();
    let target_voc = target_voc.to_path_buf();

    let inst_worker = std::thread::spawn(move || {
        run_rubberband_filter(&source_inst, &target_inst, pitch_ratio, tempo_ratio)
            .map_err(|e| e.to_string())
    });
    let voc_worker = std::thread::spawn(move || {
        run_rubberband_filter(&source_voc, &target_voc, pitch_ratio, tempo_ratio)
            .map_err(|e| e.to_string())
    });

    let inst_result = inst_worker
        .join()
        .map_err(|_| NightingaleError::Other("instrumental transform thread panicked".into()))?;
    let voc_result = voc_worker
        .join()
        .map_err(|_| NightingaleError::Other("vocals transform thread panicked".into()))?;

    if let Err(err) = inst_result {
        return Err(NightingaleError::Other(err));
    }
    if let Err(err) = voc_result {
        return Err(NightingaleError::Other(err));
    }
    Ok(())
}

fn resolve_canonical_stems_for_key(
    cache: &CacheDir,
    file_hash: &str,
    song: &Song,
    key: &str,
) -> Result<(PathBuf, PathBuf), NightingaleError> {
    let canonical_inst = cache.variant_instrumental_path(file_hash, key, 1.0);
    let canonical_voc = cache.variant_vocals_path(file_hash, key, 1.0);
    if canonical_inst.is_file() && canonical_voc.is_file() {
        return Ok((canonical_inst, canonical_voc));
    }

    if song.key.as_deref() == Some(key) {
        let legacy_inst = cache.instrumental_path(file_hash);
        let legacy_voc = cache.vocals_path(file_hash);
        if legacy_inst.is_file() && legacy_voc.is_file() {
            return Ok((legacy_inst, legacy_voc));
        }

        let ogg_inst = cache.legacy_instrumental_path(file_hash);
        let ogg_voc = cache.legacy_vocals_path(file_hash);
        if ogg_inst.is_file() && ogg_voc.is_file() {
            return Ok((ogg_inst, ogg_voc));
        }
    }

    Err(NightingaleError::Other(format!(
        "Canonical stems for key '{key}' not found. Generate/reaalyze canonical stems first."
    )))
}

fn resolve_source_transcript_path(
    cache: &CacheDir,
    file_hash: &str,
    tempo: f64,
) -> PathBuf {
    if normalize_tempo(tempo) == 1.0 {
        return cache.transcript_path(file_hash);
    }
    let variant = cache.variant_transcript_path(file_hash, tempo);
    if variant.is_file() {
        return variant;
    }
    cache.transcript_path(file_hash)
}

fn round_transcript_time(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

fn scale_time_field(node: &mut Value, field: &str, factor: f64) {
    let Some(v) = node.get(field).and_then(|v| v.as_f64()) else {
        return;
    };
    if let Some(slot) = node.get_mut(field) {
        *slot = Value::from(round_transcript_time(v * factor));
    }
}

fn scale_transcript_timestamps(transcript: &mut Value, factor: f64) {
    let Some(segments) = transcript
        .get_mut("segments")
        .and_then(|v| v.as_array_mut())
    else {
        return;
    };
    for segment in segments {
        scale_time_field(segment, "start", factor);
        scale_time_field(segment, "end", factor);
        if let Some(words) = segment.get_mut("words").and_then(|v| v.as_array_mut()) {
            for word in words {
                scale_time_field(word, "start", factor);
                scale_time_field(word, "end", factor);
            }
        }
    }
}

pub fn ensure_mp3_stems(file_hash: &str) -> Result<(), NightingaleError> {
    let cache = CacheDir::new();

    let mp3_inst = cache.instrumental_path(file_hash);
    let mp3_voc = cache.vocals_path(file_hash);

    if mp3_inst.is_file() && mp3_voc.is_file() {
        return Ok(());
    }

    if cache.has_variant_stems(file_hash) {
        return Ok(());
    }

    let ogg_inst = cache.legacy_instrumental_path(file_hash);
    let ogg_voc = cache.legacy_vocals_path(file_hash);

    if !ogg_inst.is_file() || !ogg_voc.is_file() {
        return Err("No stems found (neither mp3 nor ogg)".into());
    }

    info!("Converting legacy OGG stems to MP3 for {file_hash}");
    let ogg_inst_thread = ogg_inst.clone();
    let mp3_inst_thread = mp3_inst.clone();
    let inst_worker = std::thread::spawn(move || {
        convert_ogg_to_mp3(&ogg_inst_thread, &mp3_inst_thread).map_err(|e| e.to_string())
    });
    let ogg_voc_thread = ogg_voc.clone();
    let mp3_voc_thread = mp3_voc.clone();
    let voc_worker = std::thread::spawn(move || {
        convert_ogg_to_mp3(&ogg_voc_thread, &mp3_voc_thread).map_err(|e| e.to_string())
    });

    let inst_result = inst_worker
        .join()
        .map_err(|_| NightingaleError::Other("instrumental conversion thread panicked".into()))?;
    let voc_result = voc_worker
        .join()
        .map_err(|_| NightingaleError::Other("vocals conversion thread panicked".into()))?;
    if let Err(err) = inst_result {
        return Err(err.into());
    }
    if let Err(err) = voc_result {
        return Err(err.into());
    }

    Ok(())
}

pub fn shift_key(
    file_hash: &str,
    key: &str,
    pitch_ratio: f64,
    key_offset: i32,
) -> Result<ShiftResult, NightingaleError> {
    let Some(mut song) = library_db::load_song_by_hash(file_hash).ok().flatten() else {
        return Err("Song not found".into());
    };
    let cache = CacheDir::new();
    let target_key = key.trim().to_string();
    if target_key.is_empty() {
        return Err("target key cannot be empty".into());
    }
    let target_tempo = normalize_tempo(song.tempo);
    if is_base_original_selection(&song, &target_key, target_tempo) {
        song.override_key = None;
        song.tempo = 1.0;
        song.key_offset = 0;
        library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;
        return Ok(ShiftResult {
            key: target_key,
            tempo: 1.0,
        });
    }

    let canonical_target_inst = cache.variant_instrumental_path(file_hash, &target_key, 1.0);
    let canonical_target_voc = cache.variant_vocals_path(file_hash, &target_key, 1.0);
    let target_inst = cache.variant_instrumental_path(file_hash, &target_key, target_tempo);
    let target_voc = cache.variant_vocals_path(file_hash, &target_key, target_tempo);
    if target_inst.is_file() && target_voc.is_file() {
        song.override_key = if song.key.as_deref() == Some(target_key.as_str()) {
            None
        } else {
            Some(target_key.clone())
        };
        song.tempo = target_tempo;
        song.key_offset = key_offset;
        library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;
        return Ok(ShiftResult {
            key: target_key,
            tempo: target_tempo,
        });
    }
    let canonical_target_exists = canonical_target_inst.is_file() && canonical_target_voc.is_file();
    let target_is_original_key = song.key.as_deref() == Some(target_key.as_str());
    let canonical_for_target = if target_is_original_key && !canonical_target_exists {
        resolve_canonical_stems_for_key(&cache, file_hash, &song, &target_key)?
    } else {
        (canonical_target_inst.clone(), canonical_target_voc.clone())
    };

    if !canonical_target_exists && !target_is_original_key {
        let source_key = song
            .override_key
            .clone()
            .or(song.key.clone())
            .ok_or_else(|| NightingaleError::Other("No source key available".into()))?;
        let (source_inst, source_voc) =
            resolve_canonical_stems_for_key(&cache, file_hash, &song, &source_key)?;
        run_rubberband_pair_parallel(
            &source_inst,
            &canonical_target_inst,
            &source_voc,
            &canonical_target_voc,
            pitch_ratio,
            1.0,
        )?;
    }
    let needs_tempo_transform = target_tempo != 1.0;
    let needs_canonical_copy_from_fallback =
        target_tempo == 1.0 && target_is_original_key && !canonical_target_exists;
    if needs_tempo_transform || needs_canonical_copy_from_fallback {
        run_rubberband_pair_parallel(
            &canonical_for_target.0,
            &target_inst,
            &canonical_for_target.1,
            &target_voc,
            1.0,
            target_tempo,
        )?;
    }

    song.override_key = if song.key.as_deref() == Some(target_key.as_str()) {
        None
    } else {
        Some(target_key.clone())
    };
    song.tempo = target_tempo;
    song.key_offset = key_offset;
    library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;

    Ok(ShiftResult {
        key: target_key,
        tempo: target_tempo,
    })
}

pub fn shift_tempo(file_hash: &str, tempo: f64) -> Result<ShiftResult, NightingaleError> {
    let Some(mut song) = library_db::load_song_by_hash(file_hash).ok().flatten() else {
        return Err("Song not found".into());
    };
    let cache = CacheDir::new();
    let key = song
        .override_key
        .clone()
        .or(song.key.clone())
        .ok_or_else(|| NightingaleError::Other("No key available (re-analyze first)".into()))?;
    let target_tempo = normalize_tempo(tempo);
    let is_default_combo = is_base_original_selection(&song, &key, target_tempo);

    // Hard short-circuit rule:
    // if target key/tempo variant exists (or legacy for default combo), update DB only.
    let has_target_pair = variant_pair_exists(&cache, file_hash, &key, target_tempo)
        || (is_default_combo && legacy_pair_exists(&cache, file_hash));
    if has_target_pair {
        song.tempo = target_tempo;
        if is_default_combo && song.override_key.as_deref() == song.key.as_deref() {
            song.override_key = None;
        }
        library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;
        return Ok(ShiftResult {
            key,
            tempo: target_tempo,
        });
    }

    if is_default_combo {
        song.tempo = 1.0;
        if song.override_key.as_deref() == song.key.as_deref() {
            song.override_key = None;
        }
        library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;
        return Ok(ShiftResult { key, tempo: 1.0 });
    }
    let source_tempo = 1.0;
    let tempo_ratio = target_tempo / source_tempo;
    let target_inst = cache.variant_instrumental_path(file_hash, &key, target_tempo);
    let target_voc = cache.variant_vocals_path(file_hash, &key, target_tempo);
    let target_transcript_path = cache.variant_transcript_path(file_hash, target_tempo);

    let (source_inst, source_voc) =
        resolve_canonical_stems_for_key(&cache, file_hash, &song, &key)?;
    run_rubberband_pair_parallel(
        &source_inst,
        &target_inst,
        &source_voc,
        &target_voc,
        1.0,
        tempo_ratio,
    )?;

    let source_transcript_path = resolve_source_transcript_path(&cache, file_hash, source_tempo);
    let source_transcript_data = std::fs::read_to_string(&source_transcript_path)?;
    let mut source_transcript: Value = serde_json::from_str(&source_transcript_data)?;
    let scale_factor = source_tempo / target_tempo;
    scale_transcript_timestamps(&mut source_transcript, scale_factor);
    source_transcript["tempo"] = Value::from(target_tempo);
    source_transcript["key"] = Value::from(key.clone());
    std::fs::write(
        &target_transcript_path,
        serde_json::to_string_pretty(&source_transcript)?,
    )?;

    song.tempo = target_tempo;
    library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;

    Ok(ShiftResult {
        key,
        tempo: target_tempo,
    })
}

const PIXABAY_PER_PAGE: u32 = 200;
const MAX_CACHED_VIDEOS: usize = 12;

struct FlavorConfig {
    keywords: &'static [&'static str],
    category: &'static str,
}

fn flavor_config(flavor: &str) -> FlavorConfig {
    match flavor {
        "underwater" => FlavorConfig {
            keywords: &[
                "underwater coral reef",
                "deep sea fish",
                "ocean jellyfish",
                "tropical fish underwater",
                "sea turtle underwater",
            ],
            category: "animals",
        },
        "space" => FlavorConfig {
            keywords: &[
                "galaxy stars universe",
                "nebula deep space",
                "aurora borealis sky",
                "earth orbit space",
                "milky way night sky",
            ],
            category: "science",
        },
        "city" => FlavorConfig {
            keywords: &[
                "city skyline night",
                "city traffic timelapse",
                "neon lights city",
                "urban aerial night",
                "highway traffic night",
            ],
            category: "buildings",
        },
        "countryside" => FlavorConfig {
            keywords: &[
                "countryside meadow aerial",
                "farm fields drone",
                "rolling hills green",
                "village landscape scenic",
                "pastoral landscape sunset",
            ],
            category: "places",
        },
        _ => FlavorConfig {
            keywords: &[
                "nature landscape aerial",
                "forest trees cinematic",
                "mountain scenery drone",
                "sunset clouds timelapse",
                "waterfall tropical scenic",
            ],
            category: "nature",
        },
    }
}

fn urlencode_query(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b' ' => "+".to_string(),
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn flavor_cache_dir(flavor: &str) -> PathBuf {
    let dir = videos_dir().join(flavor);
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn cached_video_paths(flavor: &str) -> Vec<PathBuf> {
    let dir = flavor_cache_dir(flavor);
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "mp4"))
        .collect();
    files.sort();
    files
}

struct PendingDownload {
    url: String,
    dest: PathBuf,
}

fn fetch_video_listing(flavor: &str) -> Result<Vec<PendingDownload>, String> {
    let api_key = option_env!("PIXABAY_API_KEY")
        .map(|s| s.to_string())
        .or_else(|| std::env::var("PIXABAY_API_KEY").ok())
        .unwrap_or_default();

    if api_key.is_empty() {
        return Err("PIXABAY_API_KEY not set".into());
    }

    let config = flavor_config(flavor);
    let mut rng = rand::rng();
    let dir = flavor_cache_dir(flavor);

    let keyword = config
        .keywords
        .choose(&mut rng)
        .unwrap_or(&config.keywords[0]);
    let order = if rand::random::<bool>() {
        "popular"
    } else {
        "latest"
    };

    let url = format!(
        "https://pixabay.com/api/videos/?key={}&q={}&video_type=film&category={}&per_page={}&safesearch=true&order={}",
        api_key,
        urlencode_query(keyword),
        config.category,
        PIXABAY_PER_PAGE,
        order,
    );

    let body: serde_json::Value = ureq::get(&url)
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_json()
        .map_err(|e| e.to_string())?;

    let hits = body["hits"]
        .as_array()
        .ok_or("No hits in Pixabay response")?;

    let mut results: Vec<PendingDownload> = hits
        .iter()
        .filter_map(|hit| {
            let video_id = hit["id"].as_u64().unwrap_or(0);
            let video_url = hit["videos"]["large"]["url"]
                .as_str()
                .or_else(|| hit["videos"]["medium"]["url"].as_str())?;
            Some(PendingDownload {
                url: video_url.to_string(),
                dest: dir.join(format!("{video_id}.mp4")),
            })
        })
        .collect();

    results.shuffle(&mut rng);
    Ok(results)
}

fn download_file(url: &str, dest: &PathBuf) -> Result<(), String> {
    let resp = ureq::get(url).call().map_err(|e| e.to_string())?;
    let mut reader = resp.into_body().into_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut file).map_err(|e| e.to_string())?;
    Ok(())
}

const ROTATE_COUNT: usize = 2;

pub fn get_cached_pixabay_videos(flavor: &str) -> Vec<String> {
    let mut cached = cached_video_paths(flavor);
    let mut rng = rand::rng();
    cached.shuffle(&mut rng);
    cached
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

pub fn download_pixabay_videos(flavor: &str, on_downloaded: impl Fn(String) + Send + 'static) {
    let listing = match fetch_video_listing(flavor) {
        Ok(l) => l,
        Err(_) => return,
    };

    let current = cached_video_paths(flavor);
    let needed = MAX_CACHED_VIDEOS.saturating_sub(current.len());

    let mut downloaded = 0;
    for dl in listing.iter().filter(|p| !p.dest.exists()) {
        if downloaded >= needed {
            break;
        }
        if download_file(&dl.url, &dl.dest).is_ok() {
            downloaded += 1;
            on_downloaded(dl.dest.to_string_lossy().into_owned());
        }
    }

    let mut rotated = 0;
    for dl in listing.iter().filter(|p| !p.dest.exists()) {
        if rotated >= ROTATE_COUNT {
            break;
        }
        if download_file(&dl.url, &dl.dest).is_ok() {
            on_downloaded(dl.dest.to_string_lossy().into_owned());

            let mut cached = cached_video_paths(flavor);
            cached.sort();
            if cached.len() > MAX_CACHED_VIDEOS {
                let evicted = &cached[0];
                std::fs::remove_file(evicted).ok();
            }
            rotated += 1;
        }
    }
}

pub fn prefetch_one_per_flavor(mut on_progress: impl FnMut(&str) + Send) {
    let flavors = ["nature", "underwater", "space", "city", "countryside"];
    for flavor in flavors {
        let existing = cached_video_paths(flavor);
        if !existing.is_empty() {
            on_progress(&format!("{flavor}: already cached"));
            continue;
        }

        on_progress(&format!("{flavor}: fetching listing..."));
        let listing = match fetch_video_listing(flavor) {
            Ok(l) => l,
            Err(e) => {
                on_progress(&format!("{flavor}: listing failed ({e})"));
                continue;
            }
        };
        let first = listing.into_iter().find(|p| !p.dest.exists());
        let Some(dl) = first else {
            on_progress(&format!("{flavor}: no videos available"));
            continue;
        };

        on_progress(&format!("{flavor}: downloading..."));
        match download_file(&dl.url, &dl.dest) {
            Ok(_) => {
                on_progress(&format!("{flavor}: ready"));
                info!("Prefetch: saved {} for {flavor}", dl.dest.display());
            }
            Err(e) => {
                on_progress(&format!("{flavor}: download failed"));
                warn!("Prefetch: failed for {flavor}: {e}");
            }
        }
    }
}
