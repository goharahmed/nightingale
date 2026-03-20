use std::path::Path;

use app_core::SongsStore;

#[tauri::command]
pub fn trigger_scan(folder: String) {
    app_core::start_scan(Path::new(&folder));
}

#[tauri::command]
pub fn load_songs(search: Option<String>) -> SongsStore {
    SongsStore::load(search.as_ref())
}
