mod analyzer;
mod cache;
mod config;
mod logging;
mod metadata_fix;
mod microphones;
mod multi_channel_audio;
mod playback;
mod profile;
mod scanner;
mod vendor;
mod youtube;

use analyzer::{
    analyze_multi_singer, delete_song_cache, enqueue_all, enqueue_one, generate_transliteration, reanalyze_full,
    reanalyze_transcript, shift_key, shift_tempo,
};
use app_core::{AppConfig, SongsStore};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use cache::{
    calculate_cache_stats, clear_all, clear_models_command, clear_videos_command,
};
use config::{load_config, save_config, set_openai_api_key, set_hf_token};
use metadata_fix::{
    start_metadata_fix, cancel_metadata_fix, get_metadata_fix_status,
    get_pending_corrections, get_all_corrections, confirm_metadata_correction,
    reject_metadata_correction, apply_confirmed_corrections_to_files,
    update_metadata_correction,
};
use microphones::{
    list_microphones, list_input_devices,
    start_mic_capture, stop_mic_capture,
    start_mic_slot, stop_mic_slot, stop_all_mic_slots, get_mic_slot_status,
};
use playback::{
    ensure_mp3_stems, ensure_playable_source_video, fetch_pixabay_videos, get_audio_paths,
    get_multi_singer_audio_paths, get_transcript_variants, load_multi_singer_metadata, load_transcript, load_transcript_variant, save_multi_singer_metadata, save_transcript,
};
use profile::{add_score, create_profile, delete_profile, load_profiles, switch_profile};
use scanner::{
    add_song_to_playlist, create_playlist, delete_playlist, get_folder_tree,
    get_playlist_song_hashes, get_playlists, load_analysis_queue, load_library_menu_items,
    load_songs, load_songs_meta, remove_song_from_playlist, rename_playlist,
    reorder_playlist_songs, set_playlist_play_mode, trigger_scan, update_song_metadata,
};
use tauri::{Manager, RunEvent, WebviewWindowBuilder};
use vendor::{is_ready, trigger_setup};
use youtube::{download_youtube_video, get_youtube_video_info, search_youtube, set_song_thumbnail};

#[tauri::command]
fn get_media_port() -> u16 {
    app_core::media_server::port()
}

#[tauri::command]
fn frontend_ready(window: tauri::Window) {
    window.show().unwrap();
}

/// True for native fullscreen or macOS "simple" fullscreen (`set_simple_fullscreen`), where
/// `isFullscreen()` stays false but the window fills the screen.
#[tauri::command]
fn window_immersive(window: tauri::WebviewWindow) -> Result<bool, String> {
    if window.is_fullscreen().map_err(|e| e.to_string())? {
        return Ok(true);
    }
    #[cfg(target_os = "macos")]
    {
        let inner = window.inner_size().map_err(|e| e.to_string())?;
        if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
            let ms = monitor.size();
            let dw = (inner.width as i32 - ms.width as i32).abs();
            let dh = (inner.height as i32 - ms.height as i32).abs();
            if dw <= 2 && dh <= 2 {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// macOS simple fullscreen clears `Miniaturizable`; exit that mode before minimizing.
#[tauri::command]
fn minimize_window(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = window.set_simple_fullscreen(false);
    }
    window.minimize().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // Init
            frontend_ready,
            window_immersive,
            minimize_window,
            // Config
            load_config,
            save_config,
            set_openai_api_key,
            set_hf_token,
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
            load_library_menu_items,
            update_song_metadata,
            get_folder_tree,
            // Playlists
            get_playlists,
            create_playlist,
            rename_playlist,
            delete_playlist,
            set_playlist_play_mode,
            add_song_to_playlist,
            remove_song_from_playlist,
            reorder_playlist_songs,
            get_playlist_song_hashes,
            // Analyzer
            enqueue_one,
            enqueue_all,
            delete_song_cache,
            reanalyze_transcript,
            reanalyze_full,
            analyze_multi_singer,
            generate_transliteration,
            shift_key,
            shift_tempo,
            // Playback
            load_transcript,
            load_transcript_variant,
            get_transcript_variants,
            save_transcript,
            get_audio_paths,
            get_multi_singer_audio_paths,
            load_multi_singer_metadata,
            save_multi_singer_metadata,
            ensure_mp3_stems,
            ensure_playable_source_video,
            fetch_pixabay_videos,
            get_media_port,
            list_microphones,
            list_input_devices,
            start_mic_capture,
            stop_mic_capture,
            start_mic_slot,
            stop_mic_slot,
            stop_all_mic_slots,
            get_mic_slot_status,
            // Multi-channel audio
            multi_channel_audio::get_audio_output_devices,
            multi_channel_audio::start_multi_channel_playback,
            multi_channel_audio::stop_multi_channel_playback,
            multi_channel_audio::seek_multi_channel_playback,
            multi_channel_audio::get_multi_channel_playback_position,
            multi_channel_audio::get_multi_channel_playback_duration,
            multi_channel_audio::is_multi_channel_playback_active,
            // Vendor
            is_ready,
            trigger_setup,
            // YouTube
            search_youtube,
            download_youtube_video,
            get_youtube_video_info,
            set_song_thumbnail,
            // Metadata Fix
            start_metadata_fix,
            cancel_metadata_fix,
            get_metadata_fix_status,
            get_pending_corrections,
            get_all_corrections,
            confirm_metadata_correction,
            reject_metadata_correction,
            update_metadata_correction,
            apply_confirmed_corrections_to_files
        ])
        .setup(|app| {
            let _ = dotenvy::dotenv();
            app_core::init_library().map_err(|e| e.to_string())?;
            app_core::AnalysisQueue::clear();
            app_core::sync_scripts_and_deps();
            app_core::media_server::start();

            let config = AppConfig::load();
            app.handle()
                .asset_protocol_scope()
                .allow_directory(config.effective_data_path(), true)
                .map_err(|e| format!("failed to allow asset protocol for data path: {e}"))?;
            app.handle()
                .asset_protocol_scope()
                .allow_directory(app_core::default_nightingale_dir(), true)
                .map_err(|e| format!("failed to allow asset protocol for default path: {e}"))?;
            let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
            let b64 = B64.encode(json.as_bytes());

            let songs_meta = SongsStore::load_meta();
            let meta_json = serde_json::to_string(&songs_meta).map_err(|e| e.to_string())?;
            let meta_b64 = B64.encode(meta_json.as_bytes());

            let init_script = format!(
                "window.__NIGHTINGALE_APP_CONFIG__ = JSON.parse(atob('{b64}')); \
                 window.__NIGHTINGALE_SONGS_META__ = JSON.parse(atob('{meta_b64}'));",
            );

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
