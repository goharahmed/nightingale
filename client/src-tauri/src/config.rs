use app_core::AppConfig;

#[tauri::command]
pub fn load_config() -> AppConfig {
    // Return a redacted copy — the raw API key never crosses the IPC boundary.
    AppConfig::load().redacted()
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> AppConfig {
    // The frontend sends back masked keys (or null).  Preserve whatever is
    // actually on disk so we never overwrite the real keys with the mask.
    let existing = AppConfig::load();
    let mut to_save = config;
    to_save.openai_api_key = existing.openai_api_key;
    to_save.hf_token = existing.hf_token;
    to_save.save();
    to_save.redacted()
}

/// Dedicated command for setting the API key so the plaintext value only
/// travels frontend → backend once and is never stored in React state.
#[tauri::command]
pub fn set_openai_api_key(key: Option<String>) {
    AppConfig::set_openai_api_key(key);
}

/// Set or clear the HuggingFace token for pyannote diarization.
#[tauri::command]
pub fn set_hf_token(key: Option<String>) {
    AppConfig::set_hf_token(key);
}
