use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct YouTubeSearchResult {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub duration: f64,
    pub thumbnail: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct YouTubeDownloadResult {
    pub filepath: String,
    pub title: String,
    pub uploader: String,
    pub duration: f64,
    pub is_audio_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeVideoInfo {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub duration: f64,
    pub thumbnail: String,
    pub description: String,
}

fn get_python_path() -> PathBuf {
    app_core::python_path()
}

fn get_youtube_script() -> PathBuf {
    app_core::analyzer_dir().join("youtube.py")
}

/// Build a Command for the vendored Python with the correct environment.
/// In a bundled macOS .app the process inherits a minimal PATH that does
/// not include the vendor directory, so yt-dlp cannot find ffmpeg.
/// Mirror the environment setup from analyzer.rs.
fn python_command() -> Command {
    let python = get_python_path();
    let ffmpeg = app_core::ffmpeg_path();
    let ffmpeg_dir = ffmpeg
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .to_path_buf();

    // Prepend ffmpeg dir (and venv bin dir) to PATH so yt-dlp can find ffmpeg
    let path_env = if let Some(existing) = std::env::var_os("PATH") {
        let mut paths = std::env::split_paths(&existing).collect::<Vec<_>>();
        // Also add the venv bin directory so any venv scripts are reachable
        if let Some(venv_bin) = python.parent() {
            if !paths.contains(&venv_bin.to_path_buf()) {
                paths.insert(0, venv_bin.to_path_buf());
            }
        }
        if !paths.contains(&ffmpeg_dir) {
            paths.insert(0, ffmpeg_dir.clone());
        }
        std::env::join_paths(paths).unwrap_or_else(|_| ffmpeg_dir.as_os_str().to_os_string())
    } else {
        let mut paths = vec![ffmpeg_dir.clone()];
        if let Some(venv_bin) = python.parent() {
            paths.push(venv_bin.to_path_buf());
        }
        // Include basic system paths as fallback
        paths.push(PathBuf::from("/usr/local/bin"));
        paths.push(PathBuf::from("/usr/bin"));
        paths.push(PathBuf::from("/bin"));
        std::env::join_paths(paths).unwrap_or_else(|_| ffmpeg_dir.as_os_str().to_os_string())
    };

    let mut cmd = app_core::silent_command(&python);
    cmd.env("PATH", &path_env)
        .env("FFMPEG_PATH", &ffmpeg)
        .env("PYTHONIOENCODING", "utf-8");
    cmd
}

/// Search YouTube for videos
#[tauri::command]
pub async fn search_youtube(
    query: String,
    max_results: Option<u32>,
) -> Result<Vec<YouTubeSearchResult>, String> {
    let script = get_youtube_script();
    let max = max_results.unwrap_or(20);

    let output = python_command()
        .arg(&script)
        .arg("search")
        .arg(&query)
        .arg("--max-results")
        .arg(max.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to execute YouTube search: {}. Make sure to run Setup first to install yt-dlp.", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let error_msg = if stderr.contains("No module named 'yt_dlp'") || stderr.contains("yt-dlp not installed") {
            format!("YouTube search failed: yt-dlp not installed. Please run Setup to install dependencies.\n\nDetails: {}", stderr)
        } else {
            format!("YouTube search failed: {}", stderr)
        };
        return Err(error_msg);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let results: Vec<YouTubeSearchResult> =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse search results: {}", e))?;

    Ok(results)
}

/// Download a YouTube video or audio
#[tauri::command]
pub async fn download_youtube_video(
    url: String,
    audio_only: bool,
) -> Result<YouTubeDownloadResult, String> {
    let script = get_youtube_script();
    
    // Get the library folder from the database (where songs are stored)
    let (folder, _) = app_core::read_library_meta()
        .map_err(|e| format!("Failed to read library metadata: {}", e))?;
    
    if folder.is_empty() {
        return Err("No library folder configured. Please select a folder first.".to_string());
    }
    
    let output_dir = std::path::PathBuf::from(&folder);

    let mut cmd = python_command();
    cmd.arg(&script)
        .arg("download")
        .arg(&url)
        .arg("--output-dir")
        .arg(&output_dir);

    if audio_only {
        cmd.arg("--audio-only");
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to execute YouTube download: {}. Make sure to run Setup first to install yt-dlp.", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let error_msg = if stderr.contains("No module named 'yt_dlp'") || stderr.contains("yt-dlp not installed") {
            format!("YouTube download failed: yt-dlp not installed. Please run Setup to install dependencies.\n\nDetails: {}", stderr)
        } else {
            format!("YouTube download failed: {}", stderr)
        };
        return Err(error_msg);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if stdout.trim().is_empty() {
        return Err(format!("No output from download command.\nStderr: {}", stderr));
    }
    
    let result: YouTubeDownloadResult = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse download result: {}\nOutput: {}\nStderr: {}", e, stdout, stderr))?;

    Ok(result)
}

/// Get information about a YouTube video without downloading
#[tauri::command]
pub async fn get_youtube_video_info(url: String) -> Result<YouTubeVideoInfo, String> {
    let script = get_youtube_script();

    let output = python_command()
        .arg(&script)
        .arg("info")
        .arg(&url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to get video info: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get video info: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let info: YouTubeVideoInfo =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse video info: {}", e))?;

    Ok(info)
}

/// Set the thumbnail for a song.
/// `source` can be:
///   - A YouTube URL (starts with http and contains youtube.com or youtu.be)
///   - An image URL (starts with http)
///   - A local file path
#[tauri::command]
pub async fn set_song_thumbnail(
    file_hash: String,
    source: String,
) -> Result<app_core::Song, String> {
    let cache = app_core::CacheDir::new();

    let image_bytes = if source.starts_with("http://") || source.starts_with("https://") {
        // Check if this is a YouTube URL — use yt-dlp to fetch the thumbnail
        let is_youtube = source.contains("youtube.com") || source.contains("youtu.be");

        if is_youtube {
            // Use the python script to fetch the thumbnail
            let tmp_path = cache.cover_path(&format!("{file_hash}_tmp"));
            let script = get_youtube_script();
            let output = python_command()
                .arg(&script)
                .arg("fetch-thumbnail")
                .arg(&source)
                .arg("--output")
                .arg(&tmp_path)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .map_err(|e| format!("Failed to fetch YouTube thumbnail: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to fetch YouTube thumbnail: {}", stderr));
            }

            std::fs::read(&tmp_path)
                .map_err(|e| format!("Failed to read fetched thumbnail: {}", e))?
        } else {
            // Direct image URL — fetch with a simple HTTP GET
            let resp = std::process::Command::new("curl")
                .args(["-fsSL", "-o", "-", &source])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .map_err(|e| format!("Failed to download image: {}", e))?;

            if !resp.status.success() {
                let stderr = String::from_utf8_lossy(&resp.stderr);
                return Err(format!("Failed to download image: {}", stderr));
            }

            resp.stdout
        }
    } else {
        // Local file path
        std::fs::read(&source)
            .map_err(|e| format!("Failed to read local image file: {}", e))?
    };

    if image_bytes.is_empty() {
        return Err("Downloaded image is empty".to_string());
    }

    // Hash the image and save as cover using CacheDir
    let cover_path = cache.save_cover(&image_bytes)
        .ok_or_else(|| "Failed to save cover image".to_string())?;

    // Update the song record in the database
    app_core::set_song_album_art(&file_hash, &cover_path)
}
