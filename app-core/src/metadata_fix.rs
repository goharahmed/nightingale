use std::path::Path;

use lofty::{
    file::{AudioFile, TaggedFileExt},
    tag::Accessor,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use ts_rs::TS;

use crate::{config::AppConfig, library_db};

// ─── Model ──────────────────────────────────────────────────────────────

/// A proposed metadata correction for a single song.
/// Created by the OpenAI-powered fixer, stored in the DB,
/// and only applied to actual files once the user confirms.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MetadataCorrection {
    pub id: i64,
    pub file_hash: String,
    pub file_path: String,
    // Original (current) values
    pub original_title: String,
    pub original_artist: String,
    pub original_album: String,
    // AI-suggested values
    pub suggested_title: String,
    pub suggested_artist: String,
    pub suggested_album: String,
    /// URL for suggested album art (from iTunes/MusicBrainz), if found.
    pub suggested_album_art_url: Option<String>,
    /// Whether the user has reviewed and approved this correction.
    pub confirmed: bool,
    /// Whether the correction has been written to the actual file tags.
    pub applied_to_file: bool,
    /// Whether the user explicitly rejected this suggestion.
    pub rejected: bool,
}

/// Summary returned after starting a metadata fix run.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MetadataFixProgress {
    pub total: usize,
    pub processed: usize,
    pub errors: usize,
    pub running: bool,
}

/// Lightweight status polling result.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MetadataFixStatus {
    pub total: usize,
    pub processed: usize,
    pub errors: usize,
    pub running: bool,
}

// ─── Progress tracking ──────────────────────────────────────────────────

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

static FIX_RUNNING: AtomicBool = AtomicBool::new(false);
static FIX_TOTAL: AtomicUsize = AtomicUsize::new(0);
static FIX_PROCESSED: AtomicUsize = AtomicUsize::new(0);
static FIX_ERRORS: AtomicUsize = AtomicUsize::new(0);

pub fn metadata_fix_status() -> MetadataFixStatus {
    MetadataFixStatus {
        total: FIX_TOTAL.load(Ordering::Relaxed),
        processed: FIX_PROCESSED.load(Ordering::Relaxed),
        errors: FIX_ERRORS.load(Ordering::Relaxed),
        running: FIX_RUNNING.load(Ordering::Relaxed),
    }
}

// ─── Detect "bad" metadata ──────────────────────────────────────────────

/// Heuristic: returns true if the song's metadata looks like it needs fixing.
fn needs_fix(title: &str, artist: &str, album: &str, file_path: &str) -> bool {
    let stem = Path::new(file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    // Title is just the filename stem (scanner fallback)
    let title_is_filename = title == stem;
    let artist_unknown = artist == "Unknown Artist" || artist.is_empty();
    let album_unknown = album == "Unknown Album" || album.is_empty();

    // Title contains track-number-only patterns like "01", "Track 3"
    let title_is_track_num = title
        .trim()
        .chars()
        .all(|c| c.is_ascii_digit() || c == ' ' || c == '-' || c == '_')
        || title.to_lowercase().starts_with("track");

    // Title has underscores or looks like a raw filename
    let title_looks_raw = title.contains('_') && title.len() > 5;

    title_is_filename || artist_unknown || album_unknown || title_is_track_num || title_looks_raw
}

// ─── OpenAI integration ─────────────────────────────────────────────────

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Deserialize)]
struct OpenAiMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiChatResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Deserialize)]
struct AiSuggestion {
    title: String,
    artist: String,
    album: String,
}

fn build_prompt(title: &str, artist: &str, album: &str, filename: &str) -> String {
    format!(
        r#"I have a music file with possibly incorrect metadata. Please identify the correct song.

Filename: {filename}
Current title: {title}
Current artist: {artist}
Current album: {album}

Based on the filename and any metadata clues, return the CORRECT metadata as JSON:
{{"title": "...", "artist": "...", "album": "..."}}

Rules:
- If you can identify the song, return the real metadata.
- If the filename contains the song name or artist, use that.
- For the album, use the actual studio album name if identifiable, otherwise return the current album value.
- Return ONLY the JSON object, no explanation."#
    )
}

fn query_openai(api_key: &str, prompt: &str) -> Result<AiSuggestion, String> {
    let agent = ureq::Agent::new_with_defaults();

    let body = serde_json::json!({
        "model": "gpt-4.1-mini",
        "messages": [
            {
                "role": "system",
                "content": "You are a music metadata expert. You identify songs from filenames and partial metadata. Always respond with valid JSON only."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.1,
        "max_tokens": 200
    });

    let resp = agent
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", &format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .send_json(&body)
        .map_err(|e| format!("OpenAI request failed: {e}"))?;

    let chat: OpenAiChatResponse = resp
        .into_body()
        .read_json()
        .map_err(|e| format!("Failed to parse OpenAI response: {e}"))?;

    let content = chat
        .choices
        .first()
        .and_then(|c| c.message.content.as_deref())
        .ok_or("No response content from OpenAI")?;

    // The model might wrap JSON in ```json ... ``` — strip that.
    let cleaned = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    serde_json::from_str::<AiSuggestion>(cleaned)
        .map_err(|e| format!("Failed to parse AI suggestion JSON: {e} — raw: {cleaned}"))
}

// ─── Album art lookup (iTunes Search API) ───────────────────────────────

fn fetch_album_art_url(artist: &str, album: &str) -> Option<String> {
    let query = format!("{} {}", artist, album);
    let url = format!(
        "https://itunes.apple.com/search?term={}&entity=album&limit=3",
        urlencoding::encode(&query)
    );

    let agent = ureq::Agent::new_with_defaults();
    let resp = agent
        .get(&url)
        .header("User-Agent", "Nightingale/1.0")
        .call()
        .ok()?;

    let body: serde_json::Value = resp.into_body().read_json().ok()?;

    let results = body["results"].as_array()?;

    // Try to find a matching album
    for result in results {
        let art_url = result["artworkUrl100"]
            .as_str()
            .map(|u| u.replace("100x100", "600x600"));
        if art_url.is_some() {
            return art_url;
        }
    }

    None
}

/// Download album art image bytes from a URL.
pub fn download_album_art(url: &str) -> Result<Vec<u8>, String> {
    let agent = ureq::Agent::new_with_defaults();
    let resp = agent.get(url).call().map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    resp.into_body()
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

// ─── Write tags to actual files ─────────────────────────────────────────

/// Write corrected metadata tags into the actual audio file using lofty.
pub fn write_tags_to_file(
    file_path: &Path,
    title: &str,
    artist: &str,
    album: &str,
) -> Result<(), String> {
    use lofty::config::WriteOptions;

    let mut tagged = lofty::read_from_path(file_path).map_err(|e| {
        format!("Failed to open file for tag writing: {e}")
    })?;

    // Prefer the primary tag, create one if needed
    let tag = match tagged.primary_tag_mut() {
        Some(t) => t,
        None => {
            // Try to get any existing tag
            if tagged.first_tag_mut().is_some() {
                tagged.first_tag_mut().unwrap()
            } else {
                return Err("No writable tag found in file".to_string());
            }
        }
    };

    tag.set_title(title.to_string());
    tag.set_artist(artist.to_string());
    tag.set_album(album.to_string());

    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(file_path)
        .map_err(|e| format!("Failed to open file for writing: {e}"))?;

    tagged
        .save_to(&mut file, WriteOptions::default())
        .map_err(|e| format!("Failed to save tags: {e}"))?;

    info!("[metadata-fix] Wrote tags to {}", file_path.display());
    Ok(())
}

// ─── Main fix orchestration ─────────────────────────────────────────────

/// Start the metadata fix process for all songs that look like they have bad metadata.
/// Runs in a background thread. Results are stored in the DB for user review.
pub fn start_metadata_fix() -> Result<(), String> {
    if FIX_RUNNING.load(Ordering::Relaxed) {
        return Err("Metadata fix is already running".to_string());
    }

    let config = AppConfig::load();
    let api_key = config
        .openai_api_key
        .ok_or("OpenAI API key not configured. Set it in Settings first.")?;

    // Load all songs that might need fixing
    let all_songs = library_db::load_all_songs().map_err(|e| e.to_string())?;

    // Also check which file_hashes already have corrections (skip those)
    let existing_hashes = library_db::metadata_correction_hashes().map_err(|e| e.to_string())?;

    let candidates: Vec<_> = all_songs
        .into_iter()
        .filter(|s| {
            !existing_hashes.contains(&s.file_hash)
                && needs_fix(&s.title, &s.artist, &s.album, &s.path.to_string_lossy())
        })
        .collect();

    if candidates.is_empty() {
        return Err("No songs found that need metadata fixing. All songs either have good metadata or have already been processed.".to_string());
    }

    FIX_RUNNING.store(true, Ordering::Relaxed);
    FIX_TOTAL.store(candidates.len(), Ordering::Relaxed);
    FIX_PROCESSED.store(0, Ordering::Relaxed);
    FIX_ERRORS.store(0, Ordering::Relaxed);

    info!(
        "[metadata-fix] Starting fix for {} candidate songs",
        candidates.len()
    );

    std::thread::spawn(move || {
        for song in &candidates {
            if !FIX_RUNNING.load(Ordering::Relaxed) {
                info!("[metadata-fix] Cancelled by user");
                break;
            }

            let filename = song
                .path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");

            let prompt = build_prompt(&song.title, &song.artist, &song.album, filename);

            match query_openai(&api_key, &prompt) {
                Ok(suggestion) => {
                    // Only store if the suggestion actually differs from current
                    let changed = suggestion.title != song.title
                        || suggestion.artist != song.artist
                        || suggestion.album != song.album;

                    if changed {
                        // Try to fetch album art for the corrected metadata
                        let art_url =
                            fetch_album_art_url(&suggestion.artist, &suggestion.album);

                        let correction = MetadataCorrection {
                            id: 0, // DB will assign
                            file_hash: song.file_hash.clone(),
                            file_path: song.path.to_string_lossy().into_owned(),
                            original_title: song.title.clone(),
                            original_artist: song.artist.clone(),
                            original_album: song.album.clone(),
                            suggested_title: suggestion.title,
                            suggested_artist: suggestion.artist,
                            suggested_album: suggestion.album,
                            suggested_album_art_url: art_url,
                            confirmed: false,
                            applied_to_file: false,
                            rejected: false,
                        };

                        if let Err(e) =
                            library_db::insert_metadata_correction(&correction)
                        {
                            warn!(
                                "[metadata-fix] DB insert failed for {}: {e}",
                                song.file_hash
                            );
                            FIX_ERRORS.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
                Err(e) => {
                    warn!(
                        "[metadata-fix] OpenAI query failed for {} ({}): {e}",
                        filename, song.file_hash
                    );
                    FIX_ERRORS.fetch_add(1, Ordering::Relaxed);
                }
            }

            FIX_PROCESSED.fetch_add(1, Ordering::Relaxed);

            // Small delay to respect rate limits (gpt-4.1-mini: 30k RPM but be polite)
            std::thread::sleep(std::time::Duration::from_millis(200));
        }

        FIX_RUNNING.store(false, Ordering::Relaxed);
        info!("[metadata-fix] Fix run complete");
    });

    Ok(())
}

/// Cancel a running metadata fix.
pub fn cancel_metadata_fix() {
    FIX_RUNNING.store(false, Ordering::Relaxed);
}

/// Confirm a single correction. Updates the song in the DB immediately.
/// If `write_to_file` is true, also writes tags to the actual file.
pub fn confirm_correction(correction_id: i64, write_to_file: bool) -> Result<(), String> {
    let correction = library_db::get_metadata_correction(correction_id)
        .map_err(|e| e.to_string())?
        .ok_or("Correction not found")?;

    // Update song metadata in our DB
    library_db::update_song_metadata(
        &correction.file_hash,
        Some(correction.suggested_title.clone()),
        Some(correction.suggested_artist.clone()),
        Some(correction.suggested_album.clone()),
    )?;

    // Fetch and apply album art if available
    if let Some(ref art_url) = correction.suggested_album_art_url {
        if let Ok(art_bytes) = download_album_art(art_url) {
            let cache = crate::cache::CacheDir::new();
            let cover_hash = blake3::hash(&art_bytes).to_hex()[..32].to_string();
            let cover_path = cache.cover_path(&cover_hash);
            if !cover_path.exists() {
                let _ = std::fs::write(&cover_path, &art_bytes);
            }
            let _ = library_db::set_song_album_art(&correction.file_hash, &cover_path);
        }
    }

    if write_to_file {
        let path = Path::new(&correction.file_path);
        if path.exists() {
            write_tags_to_file(
                path,
                &correction.suggested_title,
                &correction.suggested_artist,
                &correction.suggested_album,
            )?;
        }
        library_db::mark_correction_applied(correction_id).map_err(|e| e.to_string())?;
    }

    library_db::mark_correction_confirmed(correction_id).map_err(|e| e.to_string())?;
    Ok(())
}

/// Reject a correction — mark it so it won't be re-processed.
pub fn reject_correction(correction_id: i64) -> Result<(), String> {
    library_db::mark_correction_rejected(correction_id).map_err(|e| e.to_string())
}

/// Apply all confirmed corrections to their actual files (batch write).
pub fn apply_confirmed_to_files() -> Result<usize, String> {
    let corrections = library_db::load_confirmed_unapplied_corrections()
        .map_err(|e| e.to_string())?;

    let mut applied = 0;
    for c in &corrections {
        let path = Path::new(&c.file_path);
        if !path.exists() {
            warn!(
                "[metadata-fix] File not found, skipping: {}",
                c.file_path
            );
            continue;
        }
        match write_tags_to_file(path, &c.suggested_title, &c.suggested_artist, &c.suggested_album)
        {
            Ok(()) => {
                let _ = library_db::mark_correction_applied(c.id);
                applied += 1;
            }
            Err(e) => {
                warn!(
                    "[metadata-fix] Failed to write tags for {}: {e}",
                    c.file_path
                );
            }
        }
    }

    info!("[metadata-fix] Applied tags to {applied}/{} files", corrections.len());
    Ok(applied)
}

/// Load all pending (unconfirmed, non-rejected) corrections for user review.
pub fn load_pending_corrections() -> Result<Vec<MetadataCorrection>, String> {
    library_db::load_pending_corrections().map_err(|e| e.to_string())
}

/// Load all corrections regardless of status.
pub fn load_all_corrections() -> Result<Vec<MetadataCorrection>, String> {
    library_db::load_all_corrections().map_err(|e| e.to_string())
}

use std::io::Read;
