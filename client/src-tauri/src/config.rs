use app_core::AppConfig;

#[tauri::command]
pub fn load_config() -> AppConfig {
    // Return a redacted copy — the raw API key never crosses the IPC boundary.
    AppConfig::load().redacted()
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> AppConfig {
    // The frontend sends back a masked key (or null).  Preserve whatever is
    // actually on disk so we never overwrite the real key with the mask.
    let real_key = AppConfig::load().openai_api_key;
    let mut to_save = config;
    to_save.openai_api_key = real_key;
    to_save.save();
    to_save.redacted()
}

/// Dedicated command for setting the API key so the plaintext value only
/// travels frontend → backend once and is never stored in React state.
#[tauri::command]
pub fn set_openai_api_key(key: Option<String>) {
    AppConfig::set_openai_api_key(key);
}

