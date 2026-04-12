use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::song::Song;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LibraryMenuFilters {
    pub artist: Option<String>,
    pub album: Option<String>,
    pub query: Option<String>,
    #[serde(default)]
    pub folder_path: Option<String>,
    #[serde(default)]
    pub folder_recursive: bool,
    #[serde(default)]
    pub playlist_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FolderTreeNode {
    pub name: String,
    pub path: String,
    pub song_count: usize,
    pub total_song_count: usize,
    pub children: Vec<FolderTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LoadSongsParams {
    pub search: Option<String>,
    pub filters: LibraryMenuFilters,
    pub skip: usize,
    pub take: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct SongsStore {
    pub count: usize,
    pub folder: String,
    pub processed: Vec<Song>,
    #[serde(default)]
    pub processed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct SongsMeta {
    pub count: usize,
    pub folder: String,
    pub processed_count: usize,
    pub songs_count: usize,
    pub videos_count: usize,
    pub analyzed_count: usize,
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Playlist {
    pub id: i64,
    pub profile: String,
    pub name: String,
    pub play_mode: PlaylistPlayMode,
    pub song_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum PlaylistPlayMode {
    Sequential,
    Random,
}

impl Default for PlaylistPlayMode {
    fn default() -> Self {
        Self::Sequential
    }
}

impl PlaylistPlayMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Sequential => "sequential",
            Self::Random => "random",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "random" => Self::Random,
            _ => Self::Sequential,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PlaylistSong {
    pub playlist_id: i64,
    pub file_hash: String,
    pub position: i64,
    pub song: Song,
}
