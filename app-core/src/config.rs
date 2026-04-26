use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::cache::config_path;

/// Persisted configuration for one microphone input slot.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MicSlotSetting {
    /// Display name of the input device (None = default).
    pub device_name: Option<String>,
    /// 0-indexed mono input channel to capture (None = down-mix all).
    pub input_channel: Option<usize>,
    /// Whether this slot is enabled.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AppConfig {
    #[serde(default = "default_data_path_option")]
    pub data_path: Option<PathBuf>,
    pub last_folder: Option<PathBuf>,
    pub last_theme: Option<usize>,
    pub guide_volume: Option<f64>,
    pub fullscreen: Option<bool>,
    pub dark_mode: Option<bool>,
    pub mic_active: Option<bool>,
    pub mic_mirroring: Option<bool>,
    pub preferred_mic: Option<String>,
    /// 0-indexed mono input channel for the single-mic path (None = down-mix all).
    pub preferred_mic_channel: Option<usize>,
    pub whisper_model: Option<String>,
    pub beam_size: Option<u32>,
    pub batch_size: Option<u32>,
    pub last_video_flavor: Option<usize>,
    pub separator: Option<String>,
    pub language_overrides: Option<HashMap<String, String>>,
    pub audio_output_vocals: Option<String>,
    pub audio_output_instrumental: Option<String>,
    // Multi-channel audio routing
    pub enable_channel_routing: Option<bool>,
    pub vocals_device_name: Option<String>,
    pub vocals_start_channel: Option<usize>,
    pub instrumental_device_name: Option<String>,
    pub instrumental_start_channel: Option<usize>,
    // Multi-mic input slots (up to 4)
    /// How many mic slots are active (1–4). `None` or `1` = legacy single-mic.
    pub mic_slot_count: Option<usize>,
    /// Per-slot settings, indexed 0..3.
    pub mic_slots: Option<Vec<MicSlotSetting>>,
    /// OpenAI API key for LLM-powered transliteration (optional).
    pub openai_api_key: Option<String>,
    /// Enable the WiFi IEM server. Default: false (off).
    pub iem_enabled: Option<bool>,
}

fn default_data_path_option() -> Option<PathBuf> {
    Some(AppConfig::default_data_path())
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            data_path: default_data_path_option(),
            last_folder: None,
            last_theme: None,
            guide_volume: None,
            fullscreen: None,
            dark_mode: None,
            mic_active: None,
            mic_mirroring: None,
            preferred_mic: None,
            preferred_mic_channel: None,
            whisper_model: None,
            beam_size: None,
            batch_size: None,
            last_video_flavor: None,
            separator: None,
            language_overrides: None,
            audio_output_vocals: None,
            audio_output_instrumental: None,
            enable_channel_routing: None,
            vocals_device_name: None,
            vocals_start_channel: None,
            instrumental_device_name: None,
            instrumental_start_channel: None,
            mic_slot_count: None,
            mic_slots: None,
            openai_api_key: None,
            iem_enabled: None,
        }
    }
}

impl AppConfig {
    pub fn default_data_path() -> PathBuf {
        crate::cache::default_nightingale_dir()
    }

    pub fn effective_data_path(&self) -> PathBuf {
        self.data_path
            .clone()
            .unwrap_or_else(Self::default_data_path)
    }

    fn with_defaults(mut self) -> Self {
        if self.data_path.is_none() {
            self.data_path = Some(Self::default_data_path());
        }
        self
    }

    pub fn load() -> Self {
        let path = config_path();

        let loaded = if path.is_file() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str::<Self>(&s).ok())
        } else {
            None
        };

        let (config, should_save) = match loaded {
            Some(cfg) => {
                let had_data_path = cfg.data_path.is_some();
                (cfg.with_defaults(), !had_data_path)
            }
            None => {
                (Self::default().with_defaults(), true)
            }
        };

        if should_save {
            config.save();
        }

        config
    }

    pub fn save(&self) {
        let path = config_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(&path, &json);
            // Restrict to owner-only so the API key isn't world-readable.
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
        }
    }

    /// Return a copy with secrets masked so it is safe to send over IPC.
    /// The raw key never leaves the Rust process.
    pub fn redacted(&self) -> Self {
        let mut copy = self.clone();
        copy.openai_api_key = self.openai_api_key.as_ref().map(|k| {
            if k.len() > 7 {
                // Show "sk-•••abcd" – enough to confirm identity, not enough to use.
                let suffix = &k[k.len().saturating_sub(4)..];
                format!("sk-•••{suffix}")
            } else {
                "••••••".to_string()
            }
        });
        copy
    }

    /// Atomically set (or clear) the OpenAI API key on disk.
    pub fn set_openai_api_key(key: Option<String>) {
        let mut config = Self::load();
        config.openai_api_key = key;
        config.save();
    }

    pub fn whisper_model(&self) -> &str {
        self.whisper_model.as_deref().unwrap_or("large-v3")
    }

    pub fn beam_size(&self) -> u32 {
        self.beam_size.unwrap_or(8)
    }

    pub fn batch_size(&self) -> u32 {
        self.batch_size.unwrap_or(8)
    }

    pub fn separator(&self) -> &str {
        self.separator.as_deref().unwrap_or("karaoke")
    }

    pub fn language_override(&self, file_hash: &str) -> Option<&str> {
        self.language_overrides
            .as_ref()
            .and_then(|m| m.get(file_hash))
            .map(|s| s.as_str())
    }

    pub fn set_language_override(&mut self, file_hash: String, lang: String) {
        self.language_overrides
            .get_or_insert_with(HashMap::new)
            .insert(file_hash, lang);
    }

    pub fn clear_language_override(&mut self, file_hash: &str) {
        if let Some(map) = self.language_overrides.as_mut() {
            map.remove(file_hash);
        }
    }
}
