mod analyzer;
mod cache;
mod config;
mod error;
mod profile;
mod scanner;
mod song;
mod vendor;
mod vendor_scripts;

pub use analyzer::{
    AnalysisQueue, delete_cache, enqueue_all, enqueue_one, reanalyze_full, reanalyze_transcript,
    shutdown_server,
};
pub use cache::{CacheStats, clear_models, clear_videos};
pub use config::AppConfig;
pub use profile::ProfileStore;
pub use scanner::{SongsMeta, SongsStore, start_scan};
pub use vendor::{
    is_ready, mark_ready, step_create_venv, step_download_ffmpeg, step_download_uv,
    step_extract_scripts, step_install_packages, step_install_python,
};
