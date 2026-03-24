mod analyzer;
mod cache;
mod config;
mod logging;
mod microphones;
mod playback;
mod profile;
mod scanner;
mod vendor;

use analyzer::{delete_song_cache, enqueue_all, enqueue_one, reanalyze_full, reanalyze_transcript};
use app_core::AppConfig;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use cache::{calculate_cache_stats, clear_all, clear_models_command, clear_videos_command};
use config::{load_config, save_config};
use microphones::{list_microphones, start_mic_capture, stop_mic_capture};
use playback::{ensure_mp3_stems, fetch_pixabay_videos, get_audio_paths, load_transcript};
use profile::{add_score, create_profile, delete_profile, load_profiles, switch_profile};
use scanner::{load_analysis_queue, load_songs, load_songs_meta, trigger_scan};
use tauri::{RunEvent, WebviewWindowBuilder};
use vendor::{is_ready, trigger_setup};

#[tauri::command]
fn get_media_port() -> u16 {
    app_core::media_server::port()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

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
            add_score,
            // Scanner
            trigger_scan,
            load_songs,
            load_songs_meta,
            load_analysis_queue,
            // Analyzer
            enqueue_one,
            enqueue_all,
            delete_song_cache,
            reanalyze_transcript,
            reanalyze_full,
            // Playback
            load_transcript,
            get_audio_paths,
            ensure_mp3_stems,
            fetch_pixabay_videos,
            get_media_port,
            list_microphones,
            start_mic_capture,
            stop_mic_capture,
            // Vendor
            is_ready,
            trigger_setup
        ])
        .setup(|app| {
            let _ = dotenvy::dotenv();
            app_core::AnalysisQueue::clear();
            app_core::media_server::start();

            let config = AppConfig::load();
            let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
            let b64 = B64.encode(json.as_bytes());
            let init_script =
                format!("window.__NIGHTINGALE_APP_CONFIG__ = JSON.parse(atob('{b64}'));",);

            let window_config = app
                .config()
                .app
                .windows
                .first()
                .ok_or_else(|| "tauri.conf.json must define at least one window".to_string())?;

            let window = WebviewWindowBuilder::from_config(app.handle(), window_config)
                .map_err(|e| e.to_string())?
                .initialization_script(init_script)
                .build()
                .map_err(|e| e.to_string())?;

            if config.fullscreen == Some(true) {
                let _ = window.set_simple_fullscreen(true);
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::Exit = event {
                app_core::shutdown_server();
            }
        });
}
