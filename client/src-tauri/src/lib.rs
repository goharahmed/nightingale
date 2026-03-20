use app_core::{clear_models, clear_videos, AppConfig, CacheStats};
use tauri::Manager;

#[tauri::command]
fn load_config() -> AppConfig {
    AppConfig::load()
}

#[tauri::command]
fn calculate_cache_stats() -> CacheStats {
    CacheStats::calculate()
}

#[tauri::command]
fn save_config(config: AppConfig) {
    config.save();
}

#[tauri::command]
fn clear_videos_command() {
    clear_videos();
}

#[tauri::command]
fn clear_models_command() {
    clear_models();
}

#[tauri::command]
fn clear_all() {
    clear_models();
    clear_videos();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            calculate_cache_stats,
            clear_videos_command,
            clear_models_command,
            clear_all
        ])
        .setup(|app| {
            let config = AppConfig::load();

            if config.fullscreen == Some(true) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_fullscreen(true);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
