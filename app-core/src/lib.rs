mod analyzer;
mod cache;
mod config;
mod error;
mod library_model;
mod library_menu;
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
pub use cache::{
    CacheDir, CacheStats, change_app_data_path, clear_models, clear_videos,
    default_nightingale_dir, nightingale_dir,
};
pub use playback::{
    AudioPaths, ShiftResult, download_pixabay_videos, ensure_mp3_stems,
    ensure_playable_source_video, get_audio_paths, get_cached_pixabay_videos, load_transcript,
    prefetch_one_per_flavor, save_transcript, shift_key, shift_tempo,
};
pub use config::AppConfig;
pub use profile::ProfileStore;
pub use library_model::{FolderTreeNode, LibraryMenuFilters, LoadSongsParams, Playlist, PlaylistPlayMode, PlaylistSong, SongsMeta, SongsStore};
pub use library_menu::{LibraryMenuItem, LibraryMenuItems, load_library_menu_items};
pub use scanner::start_scan;
pub use song::Song;
pub use library_db::{
    add_song_to_playlist, create_playlist, delete_playlist, get_folder_tree,
    get_playlist_song_hashes, get_playlists_for_profile, init_library, library_db_path,
    read_library_meta, remove_song_from_playlist, rename_playlist, reorder_playlist_songs,
    set_playlist_play_mode, set_song_album_art, update_song_metadata,
};
pub use vendor::{
    clear_vendor_dir, ffmpeg_path, is_ready, mark_ready, silent_command, step_create_venv,
    step_download_ffmpeg, step_download_uv, step_extract_scripts, step_install_packages,
    step_install_python, analyzer_dir, python_path,
};
