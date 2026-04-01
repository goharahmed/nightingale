mod analyzer;
mod cache;
mod config;
mod error;
mod library_model;
pub mod media_server;
mod playback;
mod profile;
mod scanner;
mod song;
mod library_db;
mod vendor;
mod vendor_scripts;

pub use analyzer::{
    AnalysisQueue, delete_cache, enqueue_all, enqueue_one, reanalyze_full, reanalyze_transcript,
    shutdown_server,
};
pub use cache::{CacheDir, CacheStats, clear_models, clear_videos};
pub use playback::{get_cached_pixabay_videos, download_pixabay_videos, ensure_mp3_stems, get_audio_paths, load_transcript, prefetch_one_per_flavor, AudioPaths};
pub use config::AppConfig;
pub use profile::ProfileStore;
pub use library_model::{SongsMeta, SongsStore};
pub use scanner::start_scan;
pub use library_db::{init_library, library_db_path};
pub use vendor::{
    clear_vendor_dir, is_ready, mark_ready, step_create_venv, step_download_ffmpeg,
    step_download_uv, step_extract_scripts, step_install_packages, step_install_python,
};
