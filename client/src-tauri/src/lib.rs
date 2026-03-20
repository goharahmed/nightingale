use app_core::AppConfig;
use tauri::Manager;

#[tauri::command]
fn load_config() -> AppConfig {
    AppConfig::load()
}

#[tauri::command]
fn save_config(config: AppConfig) {
    config.save();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![load_config, save_config])
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
