mod cache;
mod config;
mod profile;
mod scanner;

use app_core::AppConfig;
use cache::{calculate_cache_stats, clear_all, clear_models_command, clear_videos_command};
use config::{load_config, save_config};
use profile::{create_profile, delete_profile, load_profiles, switch_profile};
use scanner::{load_songs, trigger_scan};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // Config
            load_config,
            save_config,
            // Cache
            calculate_cache_stats,
            clear_videos_command,
            clear_models_command,
            clear_all,
            // Profile
            load_profiles,
            switch_profile,
            create_profile,
            delete_profile,
            // Scanner
            trigger_scan,
            load_songs
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
