use app_core::{
    analyze_multi_singer as core_analyze_multi_singer, delete_cache as core_delete_cache, enqueue_all as core_enqueue_all,
    enqueue_one as core_enqueue_one, reanalyze_full as core_reanalyze_full,
    reanalyze_transcript as core_reanalyze_transcript, shift_key as core_shift_key,
    shift_tempo as core_shift_tempo, LibraryMenuFilters,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

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

#[tauri::command]
pub fn analyze_multi_singer(file_hash: String) -> Result<(), String> {
    core_analyze_multi_singer(&file_hash).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_transliteration(
    app: AppHandle,
    file_hash: String,
) {
    std::thread::spawn(move || {
        let result = app_core::generate_transliteration(&file_hash);
        let payload = match result {
            Ok(_) => TransliterationDone {
                file_hash,
                error: None,
            },
            Err(err) => TransliterationDone {
                file_hash,
                error: Some(err.to_string()),
            },
        };
        let _ = app.emit("transliteration-done", payload);
    });
}

#[derive(Clone, Serialize)]
struct TransliterationDone {
    file_hash: String,
    error: Option<String>,
}

#[derive(Clone, Serialize, TS)]
#[ts(export)]
struct ShiftDone {
    file_hash: String,
    key: Option<String>,
    tempo: Option<f64>,
    error: Option<String>,
}

#[tauri::command]
pub fn shift_key(app: AppHandle, file_hash: String, key: String, pitch_ratio: f64, key_offset: i32) {
    std::thread::spawn(move || {
        let result = core_shift_key(&file_hash, &key, pitch_ratio, key_offset);
        let payload = match result {
            Ok(done) => ShiftDone {
                file_hash,
                key: Some(done.key),
                tempo: Some(done.tempo),
                error: None,
            },
            Err(err) => ShiftDone {
                file_hash,
                key: Some(key),
                tempo: None,
                error: Some(err.to_string()),
            },
        };
        let _ = app.emit("shift-key-done", payload);
    });
}

#[tauri::command]
pub fn shift_tempo(app: AppHandle, file_hash: String, tempo: f64) {
    std::thread::spawn(move || {
        let result = core_shift_tempo(&file_hash, tempo);
        let payload = match result {
            Ok(done) => ShiftDone {
                file_hash,
                key: Some(done.key),
                tempo: Some(done.tempo),
                error: None,
            },
            Err(err) => ShiftDone {
                file_hash,
                key: None,
                tempo: Some(tempo),
                error: Some(err.to_string()),
            },
        };
        let _ = app.emit("shift-tempo-done", payload);
    });
}
