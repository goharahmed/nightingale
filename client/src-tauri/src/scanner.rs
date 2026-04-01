use std::path::Path;

use app_core::{AnalysisQueue, LibraryMenuItems, LoadSongsParams, SongsMeta, SongsStore};

#[tauri::command]
pub fn trigger_scan(folder: String) {
    app_core::start_scan(Path::new(&folder));
}

#[tauri::command]
pub fn load_songs(params: LoadSongsParams) -> SongsStore {
    SongsStore::load(&params)
}

#[tauri::command]
pub fn load_songs_meta() -> SongsMeta {
    SongsStore::load_meta()
}

#[tauri::command]
pub fn load_analysis_queue() -> AnalysisQueue {
    AnalysisQueue::load()
}

#[tauri::command]
pub fn load_library_menu_items() -> Result<LibraryMenuItems, String> {
    app_core::load_library_menu_items().map_err(|e| e.to_string())
}
