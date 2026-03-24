use app_core::AudioPaths;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
struct PixabayVideoDownloaded {
    flavor: String,
    path: String,
}

#[tauri::command]
pub fn load_transcript(file_hash: String) -> Result<serde_json::Value, String> {
    app_core::load_transcript(&file_hash).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_audio_paths(file_hash: String) -> AudioPaths {
    app_core::get_audio_paths(&file_hash)
}

#[derive(Clone, Serialize)]
struct StemsReady {
    file_hash: String,
    error: Option<String>,
}

#[tauri::command]
pub fn ensure_mp3_stems(app: AppHandle, file_hash: String) {
    std::thread::spawn(move || {
        let result = app_core::ensure_mp3_stems(&file_hash);
        let _ = app.emit(
            "stems-ready",
            StemsReady {
                file_hash,
                error: result.err().map(|e| e.to_string()),
            },
        );
    });
}

#[tauri::command]
pub fn fetch_pixabay_videos(app: AppHandle, flavor: String) -> Vec<String> {
    let cached = app_core::get_cached_pixabay_videos(&flavor);

    let flavor_clone = flavor.clone();
    std::thread::spawn(move || {
        app_core::download_pixabay_videos(&flavor_clone, move |path| {
            let _ = app.emit(
                "pixabay-video-downloaded",
                PixabayVideoDownloaded {
                    flavor: flavor.clone(),
                    path,
                },
            );
        });
    });

    cached
}
