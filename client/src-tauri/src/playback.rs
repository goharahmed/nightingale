use app_core::AudioPaths;

#[tauri::command]
pub fn load_transcript(file_hash: String) -> Result<serde_json::Value, String> {
    app_core::load_transcript(&file_hash).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_audio_paths(file_hash: String) -> AudioPaths {
    app_core::get_audio_paths(&file_hash)
}

#[tauri::command]
pub fn fetch_pixabay_videos(flavor: String) -> Result<Vec<String>, String> {
    app_core::fetch_pixabay_videos(&flavor)
}
