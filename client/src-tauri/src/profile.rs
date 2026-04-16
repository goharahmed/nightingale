use app_core::ProfileStore;
use once_cell::sync::Lazy;
use std::sync::Mutex;

static STORE: Lazy<Mutex<ProfileStore>> = Lazy::new(|| Mutex::new(ProfileStore::load()));

#[tauri::command]
pub fn load_profiles() -> ProfileStore {
    STORE.lock().unwrap().clone()
}

#[tauri::command]
pub fn create_profile(name: String) {
    STORE.lock().unwrap().create_profile(name);
}

#[tauri::command]
pub fn switch_profile(name: String) {
    STORE.lock().unwrap().switch_profile(&name);
}

#[tauri::command]
pub fn delete_profile(name: String) {
    STORE.lock().unwrap().delete_profile(&name);
}

#[tauri::command]
pub fn add_score(song_hash: String, score: u32) {
    STORE.lock().unwrap().add_score(&song_hash, score);
}
