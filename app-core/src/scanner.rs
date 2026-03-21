use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use walkdir::WalkDir;

use crate::{
    cache::{CacheDir, songs_path},
    song::{AnalysisStatus, Song, build_song},
};

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "ogg", "wav", "m4a", "aac", "wma"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "webm", "mov", "m4v"];

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct SongsStore {
    pub count: usize,
    pub folder: String,
    pub processed: Vec<Song>,
}

impl SongsStore {
    pub fn load(search: Option<&String>) -> Self {
        let path = songs_path();

        let mut store: Self = if path.is_file() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Self::default()
        };

        if let Some(query) = search.filter(|s| !s.is_empty()) {
            let query = query.to_lowercase();
            store.processed.retain(|song| {
                song.title.to_lowercase().contains(&query)
                    || song.artist.to_lowercase().contains(&query)
                    || song.album.to_lowercase().contains(&query)
            });
        }

        store
    }

    pub fn save(&self) {
        let path = songs_path();

        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        if let Ok(json) = serde_json::to_string_pretty(self) {
            let tmp = path.with_extension("json.tmp");
            if std::fs::write(&tmp, &json).is_ok() {
                let _ = std::fs::rename(&tmp, &path);
            }
        }
    }
}

pub fn reset_stale_statuses() {
    let mut store = SongsStore::load(None);
    let mut changed = false;

    for song in &mut store.processed {
        if matches!(
            song.analysis_status,
            AnalysisStatus::Queued | AnalysisStatus::Analyzing(_)
        ) {
            song.analysis_status = AnalysisStatus::NotAnalyzed;
            changed = true;
        }
    }

    if changed {
        store.save();
    }
}

fn is_media_file(path: &Path) -> Option<bool> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    let ext_str = ext.as_deref()?;

    if AUDIO_EXTENSIONS.contains(&ext_str) {
        Some(false)
    } else if VIDEO_EXTENSIONS.contains(&ext_str) {
        Some(true)
    } else {
        None
    }
}

fn collect_media_paths(folder: &Path) -> Vec<(PathBuf, bool)> {
    WalkDir::new(folder)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter_map(|e| {
            let is_video = is_media_file(e.path())?;
            Some((e.path().to_path_buf(), is_video))
        })
        .collect()
}

pub fn start_scan(folder: &Path) {
    let media_files = collect_media_paths(folder);
    let folder_str = folder.to_string_lossy().into_owned();
    let existing = SongsStore::load(None);

    let same_folder = existing.folder == folder_str;

    let mut store = if same_folder {
        let mut kept = existing;
        kept.processed
            .retain(|song| media_files.iter().any(|(p, _)| *p == song.path));
        kept.count = media_files.len();
        kept
    } else {
        SongsStore {
            count: media_files.len(),
            folder: folder_str,
            processed: Vec::with_capacity(media_files.len()),
        }
    };
    store.save();

    std::thread::spawn(move || {
        let cache = CacheDir::new();
        let already_processed: std::collections::HashSet<PathBuf> =
            store.processed.iter().map(|s| s.path.clone()).collect();

        let pending: Vec<_> = media_files
            .into_iter()
            .filter(|(p, _)| !already_processed.contains(p))
            .collect();

        for (path, is_video) in pending {
            match build_song(&path, &cache, is_video) {
                Ok(song) => store.processed.push(song),
                Err(e) => {
                    eprintln!("Failed to process {}: {e}", path.display());
                }
            }
            store.save();
        }

        store
            .processed
            .sort_by(|a, b| a.artist.cmp(&b.artist).then(a.title.cmp(&b.title)));
        store.save();
    });
}
