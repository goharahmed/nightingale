use std::{
    path::{Path, PathBuf},
    process::Stdio,
};

use lofty::{
    file::{AudioFile, TaggedFileExt},
    tag::Accessor,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use blake3::Hasher;
use std::{fs::File, io::Read};

use crate::{cache::CacheDir, error::NightingaleError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum TranscriptSource {
    Lyrics,
    Generated,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Song {
    pub path: PathBuf,
    pub file_hash: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_secs: f64,
    pub album_art_path: Option<PathBuf>,
    pub is_analyzed: bool,
    pub language: Option<String>,
    #[serde(default)]
    pub language_confidence: Option<f64>,
    #[serde(default)]
    pub transcript_source: Option<TranscriptSource>,
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub override_key: Option<String>,
    #[serde(default = "default_tempo")]
    pub tempo: f64,
    #[serde(default)]
    pub bpm: Option<f64>,
    #[serde(default)]
    pub key_offset: i32,
    #[serde(default)]
    pub has_multi_singer_stems: bool,
    pub is_video: bool,
}

fn default_tempo() -> f64 {
    1.0
}

#[derive(Debug, Clone)]
pub struct TranscriptMetaInfo {
    pub source: TranscriptSource,
    pub language: Option<String>,
    pub language_confidence: Option<f64>,
    pub key: Option<String>,
    pub bpm: Option<f64>,
    pub tempo: f64,
}

impl Song {
    pub fn from_path(
        path: &Path,
        file_hash: String,
        cache: &CacheDir,
        is_analyzed: bool,
        language: Option<String>,
        language_confidence: Option<f64>,
        transcript_source: Option<TranscriptSource>,
        key: Option<String>,
        override_key: Option<String>,
        bpm: Option<f64>,
        tempo: f64,
        key_offset: i32,
        has_multi_singer_stems: bool,
        is_video: bool,
    ) -> Self {
        let (mut title, mut artist, mut album, duration_secs, cover_bytes) = if is_video {
            read_video_metadata(path)
        } else {
            read_metadata(path)
        };

        if title.is_empty() {
            title = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();
        }
        if artist.is_empty() {
            artist = "Unknown Artist".to_string();
        }
        if album.is_empty() {
            album = "Unknown Album".to_string();
        }

        let album_art_path = cover_bytes.and_then(|bytes| {
            let cover_hash = blake3::hash(&bytes).to_hex()[..32].to_string();
            let cover_path = cache.cover_path(&cover_hash);
            if !cover_path.exists() {
                std::fs::write(&cover_path, &bytes).ok()?;
            }
            Some(cover_path)
        });

        Self {
            path: path.to_path_buf(),
            file_hash,
            title,
            artist,
            album,
            duration_secs,
            album_art_path,
            is_analyzed,
            language,
            language_confidence,
            transcript_source,
            key,
            override_key,
            bpm,
            tempo,
            key_offset,
            has_multi_singer_stems,
            is_video,
        }
    }
}

pub fn compute_file_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Hasher::new();
    let mut buf = [0u8; 8192];

    loop {
        let n = file.read(&mut buf)?;

        if n == 0 {
            break;
        }

        hasher.update(&buf[..n]);
    }

    Ok(hasher.finalize().to_hex()[..32].to_string())
}

pub fn build_song(path: &Path, cache: &CacheDir, is_video: bool) -> Result<Song, NightingaleError> {
    let file_hash = compute_file_hash(path)?;

    let is_analyzed = cache.transcript_exists(&file_hash);
    let (transcript_source, language, language_confidence, key, bpm, tempo) = if is_analyzed {
        let meta = read_transcript_meta(cache, &file_hash);
        (Some(meta.source), meta.language, meta.language_confidence, meta.key, meta.bpm, meta.tempo)
    } else {
        (None, None, None, None, None, default_tempo())
    };

    let has_multi_singer_stems = cache
        .path
        .join(format!("{file_hash}_vocals_singer_1.mp3"))
        .is_file()
        && cache
            .path
            .join(format!("{file_hash}_vocals_singer_2.mp3"))
            .is_file();

    Ok(Song::from_path(
        path,
        file_hash,
        cache,
        is_analyzed,
        language,
        language_confidence,
        transcript_source,
        key,
        None,
        bpm,
        tempo,
        0,
        has_multi_singer_stems,
        is_video,
    ))
}

pub fn read_transcript_meta(cache: &CacheDir, hash: &str) -> TranscriptMetaInfo {
    #[derive(serde::Deserialize)]
    struct TranscriptMeta {
        #[serde(default)]
        source: Option<String>,
        #[serde(default)]
        language: Option<String>,
        #[serde(default)]
        language_confidence: Option<f64>,
        #[serde(default)]
        key: Option<String>,
        #[serde(default)]
        bpm: Option<f64>,
        #[serde(default = "default_tempo")]
        tempo: f64,
    }
    let path = cache.transcript_path(hash);
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<TranscriptMeta>(&data) {
            let src = if parsed.source.as_deref() == Some("lyrics") {
                TranscriptSource::Lyrics
            } else {
                TranscriptSource::Generated
            };
            return TranscriptMetaInfo {
                source: src,
                language: parsed.language,
                language_confidence: parsed.language_confidence,
                key: parsed.key,
                bpm: parsed.bpm,
                tempo: parsed.tempo,
            };
        }
    }
    TranscriptMetaInfo {
        source: TranscriptSource::Generated,
        language: None,
        language_confidence: None,
        key: None,
        bpm: None,
        tempo: default_tempo(),
    }
}

fn read_metadata(path: &Path) -> (String, String, String, f64, Option<Vec<u8>>) {
    let tagged = match lofty::read_from_path(path) {
        Ok(t) => t,
        Err(_) => return (String::new(), String::new(), String::new(), 0.0, None),
    };

    let properties = tagged.properties();
    let duration_secs = properties.duration().as_secs_f64();

    let tag = match tagged.primary_tag().or_else(|| tagged.first_tag()) {
        Some(t) => t,
        None => {
            return (
                String::new(),
                String::new(),
                String::new(),
                duration_secs,
                None,
            );
        }
    };

    let title = tag.title().map(|s| s.to_string()).unwrap_or_default();
    let artist = tag.artist().map(|s| s.to_string()).unwrap_or_default();
    let album = tag.album().map(|s| s.to_string()).unwrap_or_default();

    let album_art = tag.pictures().first().map(|pic| pic.data().to_vec());

    (title, artist, album, duration_secs, album_art)
}

fn read_video_metadata(path: &Path) -> (String, String, String, f64, Option<Vec<u8>>) {
    let ffmpeg = crate::vendor::ffmpeg_path();

    // Just probe the header -- no output file means ffmpeg reads metadata and exits immediately.
    let probe = crate::vendor::silent_command(&ffmpeg)
        .args(["-i", &path.to_string_lossy()])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output();

    let mut title = String::new();
    let mut artist = String::new();
    let mut album = String::new();
    let mut duration_secs = 0.0;

    if let Ok(output) = probe {
        let stderr = String::from_utf8_lossy(&output.stderr);
        for line in stderr.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("Duration:") {
                if let Some(ts) = rest.split(',').next() {
                    duration_secs = parse_ffmpeg_duration(ts.trim());
                }
            }
            if let Some(val) = strip_meta_tag(trimmed, "title") {
                title = val;
            }
            if let Some(val) = strip_meta_tag(trimmed, "artist") {
                artist = val;
            }
            if let Some(val) = strip_meta_tag(trimmed, "album") {
                album = val;
            }
        }
    }

    let album_art = extract_video_thumbnail(&ffmpeg, path);

    (title, artist, album, duration_secs, album_art)
}

fn extract_video_thumbnail(ffmpeg: &Path, video_path: &Path) -> Option<Vec<u8>> {
    let output = crate::vendor::silent_command(ffmpeg)
        .args([
            "-i",
            &video_path.to_string_lossy(),
            "-vframes",
            "1",
            "-f",
            "image2pipe",
            "-c:v",
            "mjpeg",
            "-vf",
            "scale=300:-1",
            "-v",
            "error",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;

    if output.status.success() && !output.stdout.is_empty() {
        Some(output.stdout)
    } else {
        None
    }
}

fn strip_meta_tag(line: &str, tag: &str) -> Option<String> {
    let lower = line.to_lowercase();
    if lower.starts_with(tag) {
        let after = &line[tag.len()..];
        let after = after.trim_start();
        if let Some(val) = after.strip_prefix(':') {
            let val = val.trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn parse_ffmpeg_duration(s: &str) -> f64 {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().unwrap_or(0.0);
        let m: f64 = parts[1].parse().unwrap_or(0.0);
        let s: f64 = parts[2].parse().unwrap_or(0.0);
        h * 3600.0 + m * 60.0 + s
    } else {
        0.0
    }
}
