use std::path::Path;

use app_core::{
    AnalysisQueue, FolderTreeNode, LibraryMenuItems, LoadSongsParams, Playlist,
    PlaylistPlayMode, Song, SongsMeta, SongsStore,
};

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

// ── Playlists ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_playlists(profile: String) -> Result<Vec<Playlist>, String> {
    app_core::get_playlists_for_profile(&profile).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_playlist(profile: String, name: String) -> Result<Playlist, String> {
    app_core::create_playlist(&profile, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_playlist(playlist_id: i64, name: String) -> Result<(), String> {
    app_core::rename_playlist(playlist_id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_playlist(playlist_id: i64) -> Result<(), String> {
    app_core::delete_playlist(playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_playlist_play_mode(playlist_id: i64, mode: PlaylistPlayMode) -> Result<(), String> {
    app_core::set_playlist_play_mode(playlist_id, mode).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_song_to_playlist(playlist_id: i64, file_hash: String) -> Result<(), String> {
    app_core::add_song_to_playlist(playlist_id, &file_hash).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_song_from_playlist(playlist_id: i64, file_hash: String) -> Result<(), String> {
    app_core::remove_song_from_playlist(playlist_id, &file_hash).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_playlist_songs(playlist_id: i64, file_hashes: Vec<String>) -> Result<(), String> {
    app_core::reorder_playlist_songs(playlist_id, &file_hashes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_playlist_song_hashes(playlist_id: i64) -> Result<Vec<String>, String> {
    app_core::get_playlist_song_hashes(playlist_id).map_err(|e| e.to_string())
}
