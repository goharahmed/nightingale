use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{LazyLock, Mutex};

use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use ts_rs::TS;

use crate::cache::{models_dir, CacheDir};
use crate::config::AppConfig;
use crate::error::NightingaleError;
use crate::library_db;
use crate::library_model::LibraryMenuFilters;
use crate::song::{read_transcript_meta, Song, TranscriptSource};

// ─── Analysis queue (persisted to disk) ──────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum QueuedStatus {
    Queued,
    Analyzing(usize),
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct AnalysisQueue {
    pub entries: HashMap<String, QueuedStatus>,
}

impl AnalysisQueue {
    pub fn load() -> Self {
        let entries = library_db::analysis_queue_load_rows()
            .map(|rows| {
                rows.into_iter()
                    .map(|(h, st, pct, msg)| {
                        let status = match st.as_str() {
                            "queued" => QueuedStatus::Queued,
                            "analyzing" => QueuedStatus::Analyzing(pct.unwrap_or(0) as usize),
                            "failed" => QueuedStatus::Failed(msg.unwrap_or_default()),
                            _ => QueuedStatus::Queued,
                        };
                        (h, status)
                    })
                    .collect()
            })
            .unwrap_or_default();
        Self { entries }
    }

    pub fn save(&self) {
        let rows: Vec<_> = self
            .entries
            .iter()
            .map(|(k, v)| match v {
                QueuedStatus::Queued => (k.clone(), "queued".to_string(), None, None),
                QueuedStatus::Analyzing(p) => (k.clone(), "analyzing".to_string(), Some(*p as i64), None),
                QueuedStatus::Failed(s) => (k.clone(), "failed".to_string(), None, Some(s.clone())),
            })
            .collect();
        let _ = library_db::analysis_queue_save_rows(&rows);
    }

    pub fn clear() {
        let _ = library_db::analysis_queue_clear();
    }
}
use crate::vendor::{analyzer_dir, ffmpeg_path, python_path, silent_command};

// ─── Server process ──────────────────────────────────────────────────

static SERVER_PID: AtomicU32 = AtomicU32::new(0);

struct ServerProcess {
    child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        let pid = self.child.id();
        info!("[analyzer] Killing server process (pid={pid})");
        SERVER_PID.store(0, Ordering::SeqCst);
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

static ANALYZER_SERVER: LazyLock<Mutex<Option<ServerProcess>>> =
    LazyLock::new(|| Mutex::new(None));

fn spawn_server() -> Result<ServerProcess, NightingaleError> {
    let python = python_path();
    let script = analyzer_dir().join("server.py");
    let models = models_dir();
    let ffmpeg = ffmpeg_path();
    let ffmpeg_dir = ffmpeg.parent().unwrap_or(std::path::Path::new("."));
    let path_env = if let Some(existing) = std::env::var_os("PATH") {
        let mut paths = std::env::split_paths(&existing).collect::<Vec<_>>();
        paths.insert(0, ffmpeg_dir.to_path_buf());
        std::env::join_paths(paths).unwrap_or(existing)
    } else {
        ffmpeg_dir.as_os_str().to_os_string()
    };

    let mut cmd = silent_command(&python);
    cmd.env("PATH", &path_env)
        .env("TORCH_HOME", models.join("torch"))
        .env("HF_HOME", models.join("huggingface"))
        .env("FFMPEG_PATH", &ffmpeg)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONWARNINGS", "ignore")
        .env("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        .env("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
        .env("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
        .env("NLTK_DATA", models.join("nltk_data"))
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        NightingaleError::Other(format!("Failed to start analyzer server: {e}"))
    })?;
    let pid = child.id();
    SERVER_PID.store(pid, Ordering::SeqCst);
    info!("[analyzer] Server process spawned (pid={pid})");

    let stdin = BufWriter::new(
        child
            .stdin
            .take()
            .ok_or(NightingaleError::Other("Failed to capture server stdin".into()))?,
    );
    let stdout = BufReader::new(
        child
            .stdout
            .take()
            .ok_or(NightingaleError::Other("Failed to capture server stdout".into()))?,
    );

    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                info!("[analyzer stderr] {line}");
            }
        });
    }

    Ok(ServerProcess {
        child,
        stdin,
        stdout,
    })
}

fn ensure_server(
    guard: &mut std::sync::MutexGuard<Option<ServerProcess>>,
) -> Result<(), NightingaleError> {
    if guard.is_some() {
        return Ok(());
    }
    let server = spawn_server()?;
    **guard = Some(server);
    Ok(())
}

// ─── Queue state ─────────────────────────────────────────────────────

struct AnalyzerState {
    queue: VecDeque<String>,
    active_hash: Option<String>,
    worker_running: bool,
}

static ANALYZER: LazyLock<Mutex<AnalyzerState>> = LazyLock::new(|| {
    Mutex::new(AnalyzerState {
        queue: VecDeque::new(),
        active_hash: None,
        worker_running: false,
    })
});

// ─── Helpers ─────────────────────────────────────────────────────────

fn update_queue_status(file_hash: &str, status: QueuedStatus) {
    let (st, pct, msg) = match &status {
        QueuedStatus::Queued => ("queued", None, None::<String>),
        QueuedStatus::Analyzing(p) => ("analyzing", Some(*p as i64), None::<String>),
        QueuedStatus::Failed(s) => ("failed", None, Some(s.clone())),
    };
    let _ = library_db::analysis_queue_upsert_row(file_hash, st, pct, msg.as_deref());
}

fn remove_from_queue(file_hash: &str) {
    let _ = library_db::analysis_queue_delete(file_hash);
}

fn update_song_analyzed(
    file_hash: &str,
    is_analyzed: bool,
    language: Option<String>,
    language_confidence: Option<f64>,
    transcript_source: Option<TranscriptSource>,
    key: Option<String>,
    tempo: Option<f64>,
) {
    let Some(mut song) = library_db::load_song_by_hash(file_hash).ok().flatten() else {
        return;
    };
    song.is_analyzed = is_analyzed;
    song.language = language;
    song.language_confidence = language_confidence;
    song.transcript_source = transcript_source;
    if is_analyzed {
        song.key = key;
        if let Some(value) = tempo {
            song.tempo = value;
        }
    } else {
        song.key = None;
        song.override_key = None;
        song.tempo = 1.0;
        song.key_offset = 0;
    }
    let _ = library_db::update_song_fields(file_hash, &song);
}

fn set_multi_singer_stems(file_hash: &str, enabled: bool) {
    let Some(mut song) = library_db::load_song_by_hash(file_hash).ok().flatten() else {
        return;
    };
    song.has_multi_singer_stems = enabled;
    let _ = library_db::update_song_fields(file_hash, &song);
}

fn ensure_worker_running(state: &mut AnalyzerState) {
    if !state.worker_running && !state.queue.is_empty() {
        state.worker_running = true;
        spawn_worker();
    }
}

// ─── Public API ──────────────────────────────────────────────────────

pub fn enqueue_one(file_hash: &str) {
    let mut state = ANALYZER.lock().unwrap();
    if state.active_hash.as_deref() == Some(file_hash) {
        return;
    }
    if !state.queue.iter().any(|h| h == file_hash) {
        state.queue.push_back(file_hash.to_string());
        update_queue_status(file_hash, QueuedStatus::Queued);
    }
    ensure_worker_running(&mut state);
}

pub fn enqueue_all(filters: &LibraryMenuFilters) {
    let queue = AnalysisQueue::load();
    let mut state = ANALYZER.lock().unwrap();

    let pending_hashes = library_db::iter_file_hashes_filtered_not_analyzed(filters).unwrap_or_default();

    let mut newly_queued = Vec::new();
    for file_hash in pending_hashes {
        let dominated = !queue.entries.contains_key(&file_hash);
        if dominated
            && state.active_hash.as_deref() != Some(&file_hash)
            && !state.queue.iter().any(|h| h == &file_hash)
        {
            state.queue.push_back(file_hash.clone());
            newly_queued.push(file_hash);
        }
    }

    let should_start = !state.worker_running && !state.queue.is_empty();
    if should_start {
        state.worker_running = true;
    }
    drop(state);

    for hash in &newly_queued {
        let _ = library_db::analysis_queue_upsert_row(hash, "queued", None, None);
    }

    if should_start {
        spawn_worker();
    }
}

pub fn shutdown_server() {
    let pid = SERVER_PID.swap(0, Ordering::SeqCst);
    if pid != 0 {
        info!("[analyzer] Graceful shutdown of server (pid={pid})");
        std::thread::spawn(move || {
            let _ = Command::new("kill").args([&pid.to_string()]).status();
            std::thread::sleep(std::time::Duration::from_secs(3));
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
        });
    }
}

/// Run a transliteration command on the Python server.
/// This is called from playback.rs to generate romanized transcripts.
pub fn run_transliteration(
    source_path: &std::path::Path,
    dest_path: &std::path::Path,
    api_key: Option<&str>,
) -> Result<bool, NightingaleError> {
    let mut cmd = serde_json::json!({
        "command": "transliterate",
        "source_path": source_path.to_string_lossy(),
        "dest_path": dest_path.to_string_lossy(),
    });
    if let Some(key) = api_key {
        cmd["api_key"] = serde_json::json!(key);
    }

    let json_str = serde_json::to_string(&cmd)
        .map_err(|e| NightingaleError::Other(format!("JSON serialization error: {e}")))?;

    let mut guard = ANALYZER_SERVER.lock().unwrap();
    ensure_server(&mut guard)?;
    let server = guard.as_mut().unwrap();

    server.stdin.write_all(json_str.as_bytes()).map_err(|e| {
        NightingaleError::Other(format!("Failed to write to server: {e}"))
    })?;
    server.stdin.write_all(b"\n").map_err(|e| {
        NightingaleError::Other(format!("Failed to write newline to server: {e}"))
    })?;
    server.stdin.flush().map_err(|e| {
        NightingaleError::Other(format!("Failed to flush server stdin: {e}"))
    })?;

    let mut line_buf = String::new();
    loop {
        line_buf.clear();
        let bytes = server.stdout.read_line(&mut line_buf).map_err(|e| {
            NightingaleError::Other(format!("Failed to read from server: {e}"))
        })?;
        if bytes == 0 {
            return Err("Server closed unexpectedly during transliteration".into());
        }
        let line = line_buf.trim_end();
        info!("[transliterate] {line}");

        if line.contains("[nightingale:DONE]") {
            return Ok(true);
        }
        if line.contains("[nightingale:ERROR]") {
            let msg = line
                .split("[nightingale:ERROR]")
                .nth(1)
                .unwrap_or("Transliteration failed")
                .trim()
                .to_string();
            return Err(NightingaleError::Other(msg));
        }
    }
}

pub fn delete_cache(file_hash: &str) {
    let cache = CacheDir::new();
    cache.delete_song_cache(file_hash);
    update_song_analyzed(file_hash, false, None, None, None, None, None);
    set_multi_singer_stems(file_hash, false);
}

pub fn reanalyze_transcript(file_hash: &str, language: Option<String>) {
    let mut config = AppConfig::load();
    match language {
        Some(ref lang) if !lang.is_empty() => {
            config.set_language_override(file_hash.to_string(), lang.clone());
        }
        _ => {
            // Auto-detect: clear any previous override so the pipeline
            // will run language detection from scratch.
            config.clear_language_override(file_hash);
        }
    }
    config.save();
    reanalyze(file_hash, false);
}

pub fn reanalyze_full(file_hash: &str) {
    reanalyze(file_hash, true);
}

fn reanalyze(file_hash: &str, full: bool) {
    let cache = CacheDir::new();
    if full {
        cache.delete_song_cache(file_hash);
    } else {
        let _ = std::fs::remove_file(cache.transcript_path(file_hash));
        cache.delete_transcript_variants(file_hash);
        let _ = std::fs::remove_file(cache.lyrics_path(file_hash));
    }
    update_song_analyzed(file_hash, false, None, None, None, None, None);
    set_multi_singer_stems(file_hash, false);
    enqueue_one(file_hash);
}

pub fn analyze_multi_singer(file_hash: &str) -> Result<(), NightingaleError> {
    crate::playback::generate_multi_singer_stems(file_hash)?;
    set_multi_singer_stems(file_hash, true);
    Ok(())
}

// ─── Worker ──────────────────────────────────────────────────────────

fn spawn_worker() {
    std::thread::spawn(|| {
        let cache = CacheDir::new();

        loop {
            let file_hash = {
                let mut state = ANALYZER.lock().unwrap();
                match state.queue.pop_front() {
                    Some(hash) => {
                        state.active_hash = Some(hash.clone());
                        hash
                    }
                    None => {
                        state.worker_running = false;
                        state.active_hash = None;
                        return;
                    }
                }
            };

            process_song(&file_hash, &cache);

            let mut state = ANALYZER.lock().unwrap();
            state.active_hash = None;
        }
    });
}

fn process_song(file_hash: &str, cache: &CacheDir) {
    let Some(song) = library_db::load_song_by_hash(file_hash).ok().flatten() else {
        warn!("[analyzer] Song with hash {file_hash} not found in store, skipping");
        return;
    };

    info!(
        "[analyzer] Starting analysis: {} (hash={})",
        song.path.display(),
        file_hash
    );

    update_queue_status(file_hash, QueuedStatus::Analyzing(0));

    let config = AppConfig::load();
    let lyrics_path = fetch_lrclib_lyrics(&song, cache);

    let mut cmd_json = serde_json::json!({
        "command": "analyze",
        "audio_path": song.path.to_string_lossy(),
        "cache_path": cache.path.to_string_lossy(),
        "hash": file_hash,
        "model": config.whisper_model(),
        "beam_size": config.beam_size(),
        "batch_size": config.batch_size(),
        "separator": config.separator(),
    });

    if let Some(ref lp) = lyrics_path {
        cmd_json["lyrics"] = serde_json::json!(lp.to_string_lossy());
    }
    if let Some(lang) = config.language_override(file_hash) {
        cmd_json["language"] = serde_json::json!(lang);
    }

    let json_str = serde_json::to_string(&cmd_json).unwrap();
    let mut retried = false;

    loop {
        let mut guard = ANALYZER_SERVER.lock().unwrap();

        if let Err(e) = ensure_server(&mut guard) {
            warn!("[analyzer] Failed to start server: {e}");
            update_queue_status(file_hash, QueuedStatus::Failed(e.to_string()));
            return;
        }

        let server = guard.as_mut().unwrap();
        match send_and_monitor(server, &json_str, file_hash) {
            Ok(SongResult::Done) => {
                finalize_song(file_hash, cache);
                return;
            }
            Ok(SongResult::Oom) => {
                warn!("[analyzer] CUDA OOM, killing server to free GPU memory");
                *guard = None;

                if !retried {
                    retried = true;
                    info!("[analyzer] Respawning server and retrying with clean GPU");
                    update_queue_status(file_hash, QueuedStatus::Analyzing(0));
                    continue;
                }
                update_queue_status(
                    file_hash,
                    QueuedStatus::Failed("CUDA out of memory".into()),
                );
                return;
            }
            Ok(SongResult::Error(msg)) => {
                update_queue_status(file_hash, QueuedStatus::Failed(msg));
                return;
            }
            Err(e) => {
                warn!("[analyzer] Server crashed: {e}");
                *guard = None;

                if !retried {
                    retried = true;
                    info!("[analyzer] Respawning server and retrying");
                    update_queue_status(file_hash, QueuedStatus::Analyzing(0));
                    continue;
                }
                update_queue_status(
                    file_hash,
                    QueuedStatus::Failed(format!("Server crashed: {e}")),
                );
                return;
            }
        }
    }
}

fn finalize_song(file_hash: &str, cache: &CacheDir) {
    if cache.transcript_exists(file_hash) {
        if let Err(err) = crate::playback::ensure_playable_source_video(file_hash) {
            warn!("[analyzer] Playable source-video conversion failed for {file_hash}: {err}");
        }
        let meta = read_transcript_meta(cache, file_hash);
        remove_from_queue(file_hash);
        update_song_analyzed(
            file_hash,
            true,
            meta.language,
            meta.language_confidence,
            Some(meta.source),
            meta.key,
            Some(meta.tempo),
        );
        info!("[analyzer] Analysis complete for {file_hash}");
    } else {
        update_queue_status(
            file_hash,
            QueuedStatus::Failed("Transcript file not found after analysis".into()),
        );
    }
}

// ─── Server communication ────────────────────────────────────────────

enum SongResult {
    Done,
    Oom,
    Error(String),
}

fn send_and_monitor(
    server: &mut ServerProcess,
    json_cmd: &str,
    file_hash: &str,
) -> Result<SongResult, NightingaleError> {
    server.stdin.write_all(json_cmd.as_bytes())?;
    server.stdin.write_all(b"\n")?;
    server.stdin.flush()?;

    let mut line_buf = String::new();
    loop {
        line_buf.clear();
        let bytes = server.stdout.read_line(&mut line_buf)?;

        if bytes == 0 {
            return Err("Server process closed stdout unexpectedly".into());
        }

        let line = line_buf.trim_end();
        info!("[analyzer] {line}");

        if line.contains("[nightingale:DONE]") {
            return Ok(SongResult::Done);
        }
        if line.contains("[nightingale:OOM]") {
            return Ok(SongResult::Oom);
        }
        if line.contains("[nightingale:ERROR]") {
            let msg = line
                .split("[nightingale:ERROR]")
                .nth(1)
                .unwrap_or("Unknown error")
                .trim()
                .to_string();
            return Ok(SongResult::Error(msg));
        }

        if let Some((pct, _msg)) = parse_progress_line(line) {
            update_queue_status(file_hash, QueuedStatus::Analyzing(pct as usize));
        }
    }
}

fn parse_progress_line(line: &str) -> Option<(u32, String)> {
    let prefix = "[nightingale:PROGRESS:";
    let start = line.find(prefix)?;
    let after_prefix = &line[start + prefix.len()..];
    let end_bracket = after_prefix.find(']')?;
    let pct_str = &after_prefix[..end_bracket];
    let pct: u32 = pct_str.parse().ok()?;
    let msg = after_prefix[end_bracket + 1..].trim().to_string();
    Some((pct, msg))
}

// ─── Lyrics fetching ─────────────────────────────────────────────────

fn fetch_lrclib_lyrics(song: &Song, cache: &CacheDir) -> Option<PathBuf> {
    let title = &song.title;
    let artist = &song.artist;

    if title.is_empty() || artist == "Unknown Artist" {
        return None;
    }

    let agent = ureq::Agent::new_with_defaults();

    info!(
        "[lrclib] Searching: \"{title}\" by \"{artist}\" ({:.0}s, album=\"{}\")",
        song.duration_secs, song.album
    );

    let url = format!(
        "https://lrclib.net/api/search?track_name={}&artist_name={}",
        urlencoding::encode(title),
        urlencoding::encode(artist),
    );
    let resp = match agent
        .get(&url)
        .header("User-Agent", "Nightingale/1.0")
        .call()
    {
        Ok(r) => r,
        Err(e) => {
            warn!("[lrclib] Search request failed: {e}");
            return None;
        }
    };
    let results: Vec<serde_json::Value> = match resp.into_body().read_json() {
        Ok(r) => r,
        Err(e) => {
            warn!("[lrclib] Failed to parse search results: {e}");
            return None;
        }
    };

    let with_lyrics: Vec<_> = results
        .into_iter()
        .filter(|r| {
            r.get("plainLyrics")
                .and_then(|v| v.as_str())
                .is_some_and(|s| !s.is_empty())
                || r.get("syncedLyrics")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| !s.is_empty())
        })
        .collect();

    info!(
        "[lrclib] Search returned {} results with lyrics",
        with_lyrics.len()
    );

    let album_lower = song.album.to_lowercase();
    let record = with_lyrics.into_iter().min_by_key(|r| {
        let album_match = r
            .get("albumName")
            .and_then(|v| v.as_str())
            .is_some_and(|a| a.to_lowercase() == album_lower);
        let d = r.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let duration_penalty = ((d - song.duration_secs).abs() * 10.0) as i64;
        let album_bonus: i64 = if album_match { 0 } else { 5_000 };

        album_bonus + duration_penalty
    });

    if let Some(ref r) = record {
        let d = r.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let name = r
            .get("trackName")
            .and_then(|v| v.as_str())
            .unwrap_or("?");
        let album = r
            .get("albumName")
            .and_then(|v| v.as_str())
            .unwrap_or("?");
        info!(
            "[lrclib] Picked \"{}\" from \"{}\" (duration {:.0}s, delta {:.1}s)",
            name,
            album,
            d,
            (d - song.duration_secs).abs()
        );
    }

    let record = record?;

    let plain = record
        .get("plainLyrics")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())?;

    let lines: Vec<String> = plain
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.is_empty() {
        warn!("[lrclib] Extracted 0 lines, skipping");
        return None;
    }

    info!("[lrclib] Extracted {} lines", lines.len());
    let lyrics_json = serde_json::json!({"lines": lines});

    let out = cache.lyrics_path(&song.file_hash);
    match std::fs::write(&out, serde_json::to_string_pretty(&lyrics_json).unwrap()) {
        Ok(_) => {
            info!("[lrclib] Lyrics saved to {}", out.display());
            Some(out)
        }
        Err(e) => {
            warn!("[lrclib] Failed to write lyrics: {e}");
            None
        }
    }
}
