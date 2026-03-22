use std::path::Path;

use app_core::{AnalysisQueue, SongsMeta, SongsStore};

#[tauri::command]
pub fn trigger_scan(folder: String) {
    app_core::start_scan(Path::new(&folder));
}

#[tauri::command]
pub fn load_songs(search: Option<String>, skip: usize, take: usize) -> SongsStore {
    SongsStore::load(search.as_ref(), skip, take)
}

#[tauri::command]
pub fn load_songs_meta() -> SongsMeta {
    SongsStore::load_meta()
}

#[tauri::command]
pub fn load_analysis_queue() -> AnalysisQueue {
    AnalysisQueue::load()
}
