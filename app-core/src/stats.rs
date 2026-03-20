use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::cache::{clearable_video_bytes, dir_size, nightingale_dir};

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct CacheStats {
    pub songs_bytes: u64,
    pub videos_bytes: u64,
    pub models_bytes: u64,
    pub other_bytes: u64,
    pub clearable_videos_bytes: u64,
}

impl CacheStats {
    pub fn calculate() -> Self {
        let base = nightingale_dir();

        let songs_bytes = dir_size(&base.join("cache"));
        let videos_bytes = dir_size(&base.join("videos"));
        let models_bytes = dir_size(&base.join("models"));
        let other_bytes = dir_size(&base.join("vendor"))
            + dir_size(&base.join("sounds"))
            + base
                .join("nightingale.log")
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0)
            + base
                .join("config.json")
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0)
            + base
                .join("profiles.json")
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0);

        Self {
            songs_bytes,
            videos_bytes,
            models_bytes,
            other_bytes,
            clearable_videos_bytes: clearable_video_bytes(),
        }
    }
}
