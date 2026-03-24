use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::warn;
use ts_rs::TS;
use walkdir::WalkDir;

use crate::{
    cache::{songs_path, CacheDir},
    song::{build_song, Song},
};

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "ogg", "wav", "m4a", "aac", "wma"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "webm", "mov", "m4v"];

const SCAN_SAVE_BATCH_SIZE: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct SongsStore {
    pub count: usize,
    pub folder: String,
    pub processed: Vec<Song>,
    #[serde(default)]
    pub processed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct SongsMeta {
    pub count: usize,
    pub folder: String,
    pub processed_count: usize,
    pub songs_count: usize,
    pub videos_count: usize,
    pub analyzed_count: usize,
}

impl SongsStore {
    fn load_raw() -> Self {
        let path = songs_path();

        if path.is_file() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn load_all() -> Self {
        let mut store = Self::load_raw();
        store.processed_count = store.processed.len();
        store
    }

    pub fn load(search: Option<&String>, skip: usize, take: usize) -> Self {
        let mut store = Self::load_raw();

        if let Some(query) = search.filter(|s| !s.is_empty()) {
            let query = query.to_lowercase();
            store.processed.retain(|song| {
                song.title.to_lowercase().contains(&query)
                    || song.artist.to_lowercase().contains(&query)
                    || song.album.to_lowercase().contains(&query)
            });
        }

        store.processed_count = store.processed.len();

        let end = (skip + take).min(store.processed.len());
        let start = skip.min(end);
        store.processed = store.processed[start..end].to_vec();

        store
    }

    pub fn load_meta() -> SongsMeta {
        let store = Self::load_raw();
        let mut songs_count: usize = 0;
        let mut videos_count: usize = 0;
        let mut analyzed_count: usize = 0;

        for song in &store.processed {
            if song.is_video {
                videos_count += 1;
            } else {
                songs_count += 1;
            }
            if song.is_analyzed {
                analyzed_count += 1;
            }
        }

        SongsMeta {
            count: store.count,
            folder: store.folder,
            processed_count: store.processed.len(),
            songs_count,
            videos_count,
            analyzed_count,
        }
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

fn flush_batch(batch: &mut Vec<Song>) {
    let mut store = SongsStore::load_all();
    store.processed.append(batch);
    store.save();
}

pub fn start_scan(folder: &Path) {
    let media_files = collect_media_paths(folder);
    let folder_str = folder.to_string_lossy().into_owned();
    let existing = SongsStore::load_all();

    let same_folder = existing.folder == folder_str;

    let store = if same_folder {
        let media_paths: HashSet<&PathBuf> = media_files.iter().map(|(p, _)| p).collect();
        let mut kept = existing;
        kept.processed
            .retain(|song| media_paths.contains(&song.path));
        kept.count = media_files.len();
        kept
    } else {
        SongsStore {
            count: media_files.len(),
            folder: folder_str,
            processed: Vec::with_capacity(media_files.len()),
            processed_count: 0,
        }
    };
    store.save();

    std::thread::spawn(move || {
        let cache = CacheDir::new();
        let already_processed: HashSet<PathBuf> =
            store.processed.iter().map(|s| s.path.clone()).collect();

        let pending: Vec<_> = media_files
            .into_iter()
            .filter(|(p, _)| !already_processed.contains(p))
            .collect();

        let mut batch: Vec<Song> = Vec::new();

        for (i, (path, is_video)) in pending.iter().enumerate() {
            match build_song(path, &cache, *is_video) {
                Ok(song) => batch.push(song),
                Err(e) => {
                    warn!("Failed to process {}: {e}", path.display());
                }
            }
            if (i + 1) % SCAN_SAVE_BATCH_SIZE == 0 && !batch.is_empty() {
                flush_batch(&mut batch);
            }
        }

        if !batch.is_empty() {
            flush_batch(&mut batch);
        }

        let mut store = SongsStore::load_all();
        store
            .processed
            .sort_by(|a, b| a.artist.cmp(&b.artist).then(a.title.cmp(&b.title)));
        store.save();
    });
}
