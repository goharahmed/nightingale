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
