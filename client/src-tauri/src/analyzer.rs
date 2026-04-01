use app_core::{
    delete_cache as core_delete_cache, enqueue_all as core_enqueue_all,
    enqueue_one as core_enqueue_one, reanalyze_full as core_reanalyze_full,
    reanalyze_transcript as core_reanalyze_transcript, LibraryMenuFilters,
};

#[tauri::command]
pub fn enqueue_one(file_hash: String) {
    core_enqueue_one(&file_hash);
}

#[tauri::command]
pub fn enqueue_all(filters: LibraryMenuFilters) {
    core_enqueue_all(&filters);
}

#[tauri::command]
pub fn delete_song_cache(file_hash: String) {
    core_delete_cache(&file_hash);
}

#[tauri::command]
pub fn reanalyze_transcript(file_hash: String, language: Option<String>) {
    core_reanalyze_transcript(&file_hash, language);
}

#[tauri::command]
pub fn reanalyze_full(file_hash: String) {
    core_reanalyze_full(&file_hash);
}
