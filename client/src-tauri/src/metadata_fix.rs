use app_core::{MetadataCorrection, MetadataFixStatus};

#[tauri::command]
pub fn start_metadata_fix() -> Result<(), String> {
    app_core::start_metadata_fix()
}

#[tauri::command]
pub fn cancel_metadata_fix() {
    app_core::cancel_metadata_fix();
}

#[tauri::command]
pub fn get_metadata_fix_status() -> MetadataFixStatus {
    app_core::metadata_fix_status()
}

#[tauri::command]
pub fn get_pending_corrections() -> Result<Vec<MetadataCorrection>, String> {
    app_core::load_pending_corrections()
}

#[tauri::command]
pub fn get_all_corrections() -> Result<Vec<MetadataCorrection>, String> {
    app_core::load_all_corrections()
}

#[tauri::command]
pub fn confirm_metadata_correction(correction_id: i64, write_to_file: bool) -> Result<(), String> {
    app_core::confirm_correction(correction_id, write_to_file)
}

#[tauri::command]
pub fn reject_metadata_correction(correction_id: i64) -> Result<(), String> {
    app_core::reject_correction(correction_id)
}

#[tauri::command]
pub fn update_metadata_correction(
    correction_id: i64,
    title: String,
    artist: String,
    album: String,
) -> Result<(), String> {
    app_core::update_correction_suggestions(correction_id, title, artist, album)
}

#[tauri::command]
pub fn apply_confirmed_corrections_to_files() -> Result<usize, String> {
    app_core::apply_confirmed_to_files()
}
