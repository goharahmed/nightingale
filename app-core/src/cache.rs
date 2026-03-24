use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct CacheDir {
    pub path: PathBuf,
}

impl CacheDir {
    pub fn new() -> Self {
        let path = nightingale_dir().join("cache");
        std::fs::create_dir_all(&path).expect("could not create cache directory");
        Self { path }
    }

    pub fn transcript_path(&self, hash: &str) -> PathBuf {
        self.path.join(format!("{hash}_transcript.json"))
    }

    pub fn instrumental_path(&self, hash: &str) -> PathBuf {
        self.path.join(format!("{hash}_instrumental.mp3"))
    }

    pub fn vocals_path(&self, hash: &str) -> PathBuf {
        self.path.join(format!("{hash}_vocals.mp3"))
    }

    pub fn legacy_instrumental_path(&self, hash: &str) -> PathBuf {
        self.path.join(format!("{hash}_instrumental.ogg"))
    }

    pub fn legacy_vocals_path(&self, hash: &str) -> PathBuf {
        self.path.join(format!("{hash}_vocals.ogg"))
    }

    fn stems_exist(&self, hash: &str) -> bool {
        (self.instrumental_path(hash).is_file() && self.vocals_path(hash).is_file())
            || (self.legacy_instrumental_path(hash).is_file()
                && self.legacy_vocals_path(hash).is_file())
    }

    pub fn lyrics_path(&self, hash: &str) -> PathBuf {
        self.path.join(format!("{hash}_lyrics.json"))
    }

    pub fn cover_path(&self, hash: &str) -> PathBuf {
        self.path.join(format!("{hash}_cover.jpg"))
    }

    pub fn transcript_exists(&self, hash: &str) -> bool {
        self.transcript_path(hash).is_file() && self.stems_exist(hash)
    }

    pub fn delete_song_cache(&self, hash: &str) {
        for path in [
            self.transcript_path(hash),
            self.instrumental_path(hash),
            self.vocals_path(hash),
            self.legacy_instrumental_path(hash),
            self.legacy_vocals_path(hash),
            self.lyrics_path(hash),
        ] {
            if path.is_file() {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    pub fn clear_all(&self) {
        if self.path.is_dir() {
            let _ = std::fs::remove_dir_all(&self.path);
            let _ = std::fs::create_dir_all(&self.path);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct CacheStats {
    pub songs_bytes: u64,
    pub videos_bytes: u64,
    pub models_bytes: u64,
    pub other_bytes: u64,
    pub clearable_videos_bytes: u64,
}

impl CacheStats {
    pub fn calculate() -> Self {
        let base = nightingale_dir();

        let songs_bytes = dir_size(&base.join("cache"));
        let videos_bytes = dir_size(&base.join("videos"));
        let models_bytes = dir_size(&base.join("models"));
        let other_bytes = dir_size(&base.join("vendor"))
            + dir_size(&base.join("sounds"))
            + base
                .join("nightingale.log")
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0)
            + base
                .join("config.json")
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0)
            + base
                .join("profiles.json")
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0);

        Self {
            songs_bytes,
            videos_bytes,
            models_bytes,
            other_bytes,
            clearable_videos_bytes: clearable_video_bytes(),
        }
    }
}

pub fn nightingale_dir() -> PathBuf {
    dirs::home_dir()
        .expect("could not find home directory")
        .join(".nightingale")
}

pub fn config_path() -> PathBuf {
    nightingale_dir().join("config.json")
}

pub fn profiles_path() -> PathBuf {
    nightingale_dir().join("profiles.json")
}

pub fn songs_path() -> PathBuf {
    nightingale_dir().join("songs.json")
}

pub fn analysis_queue_path() -> PathBuf {
    nightingale_dir().join("analysis_queue.json")
}

pub fn videos_dir() -> PathBuf {
    nightingale_dir().join("videos")
}

pub fn models_dir() -> PathBuf {
    nightingale_dir().join("models")
}

pub fn dir_size(path: &Path) -> u64 {
    if !path.is_dir() {
        return 0;
    }

    WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

pub fn clearable_video_bytes() -> u64 {
    let base = videos_dir();

    if !base.is_dir() {
        return 0;
    }

    let mut total: u64 = 0;
    for entry in std::fs::read_dir(&base).into_iter().flatten().flatten() {
        let flavor_dir = entry.path();

        if !flavor_dir.is_dir() {
            continue;
        }

        let mut mp4s: Vec<_> = std::fs::read_dir(&flavor_dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "mp4"))
            .collect();
        mp4s.sort();

        for path in mp4s.into_iter().skip(1) {
            total += path.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    total
}

pub fn clear_videos() {
    let base = videos_dir();

    if !base.is_dir() {
        return;
    }

    for entry in std::fs::read_dir(&base).into_iter().flatten().flatten() {
        let flavor_dir = entry.path();
        if !flavor_dir.is_dir() {
            continue;
        }
        let mut mp4s: Vec<_> = std::fs::read_dir(&flavor_dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "mp4"))
            .collect();

        mp4s.sort();

        for path in mp4s.into_iter().skip(1) {
            let _ = std::fs::remove_file(&path);
        }
    }
}

pub fn clear_models() {
    let dir = models_dir();

    if dir.is_dir() {
        let _ = std::fs::remove_dir_all(&dir);
    }
}
