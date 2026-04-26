use app_core::iem::IemStatus;

#[tauri::command]
pub fn iem_start() -> Result<IemStatus, String> {
    app_core::iem_server::start()
}

#[tauri::command]
pub fn iem_stop() -> Result<(), String> {
    app_core::iem_server::stop()
}

#[tauri::command]
pub fn iem_status() -> IemStatus {
    app_core::iem_server::status()
}

#[tauri::command]
pub fn iem_play(file_hash: String, position_ms: u64) -> Result<(), String> {
    app_core::iem_server::play(&file_hash, position_ms)
}

#[tauri::command]
pub fn iem_pause() -> Result<(), String> {
    app_core::iem_server::pause()
}

#[tauri::command]
pub fn iem_stop_playback() -> Result<(), String> {
    app_core::iem_server::stop_playback()
}
