use std::path::Path;

use app_core::{AnalysisQueue, FolderTreeNode, LibraryMenuItems, LoadSongsParams, Song, SongsMeta, SongsStore};

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

#[tauri::command]
pub fn get_folder_tree() -> Result<Vec<FolderTreeNode>, String> {
    app_core::get_folder_tree().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_song_metadata(
    file_hash: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
) -> Result<Song, String> {
    app_core::update_song_metadata(&file_hash, title, artist, album)
}
