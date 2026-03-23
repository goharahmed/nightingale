use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{LazyLock, Mutex};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::cache::{analysis_queue_path, models_dir, CacheDir};
use crate::config::AppConfig;
use crate::error::NightingaleError;
use crate::scanner::SongsStore;
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
        let path = analysis_queue_path();
        if path.is_file() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) {
        let path = analysis_queue_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let tmp = path.with_extension("json.tmp");
            if std::fs::write(&tmp, &json).is_ok() {
                let _ = std::fs::rename(&tmp, &path);
            }
        }
    }

    pub fn clear() {
        let path = analysis_queue_path();
        let _ = std::fs::remove_file(path);
    }

    fn set_status(&mut self, file_hash: &str, status: QueuedStatus) {
        self.entries.insert(file_hash.to_string(), status);
        self.save();
    }

    fn remove(&mut self, file_hash: &str) {
        self.entries.remove(file_hash);
        self.save();
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
        eprintln!("[analyzer] Killing server process (pid={pid})");
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
    eprintln!("[analyzer] Server process spawned (pid={pid})");

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
                eprintln!("[analyzer stderr] {line}");
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
    let mut queue = AnalysisQueue::load();
    queue.set_status(file_hash, status);
}

fn remove_from_queue(file_hash: &str) {
    let mut queue = AnalysisQueue::load();
    queue.remove(file_hash);
}

fn update_song_analyzed(
    file_hash: &str,
    is_analyzed: bool,
    language: Option<String>,
    transcript_source: Option<TranscriptSource>,
) {
    let mut store = SongsStore::load_all();
    if let Some(song) = store
        .processed
        .iter_mut()
        .find(|s| s.file_hash == file_hash)
    {
        song.is_analyzed = is_analyzed;
        song.language = language;
        song.transcript_source = transcript_source;
    }
    store.save();
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

pub fn enqueue_all() {
    let store = SongsStore::load_all();
    let queue = AnalysisQueue::load();
    let mut state = ANALYZER.lock().unwrap();

    let mut newly_queued = Vec::new();
    for song in &store.processed {
        let dominated = !song.is_analyzed && !queue.entries.contains_key(&song.file_hash);
        if dominated
            && state.active_hash.as_deref() != Some(&song.file_hash)
            && !state.queue.iter().any(|h| h == &song.file_hash)
        {
            state.queue.push_back(song.file_hash.clone());
            newly_queued.push(song.file_hash.clone());
        }
    }

    let should_start = !state.worker_running && !state.queue.is_empty();
    if should_start {
        state.worker_running = true;
    }
    drop(state);

    if !newly_queued.is_empty() {
        let mut queue = AnalysisQueue::load();
        for hash in &newly_queued {
            queue.entries.insert(hash.clone(), QueuedStatus::Queued);
        }
        queue.save();
    }

    if should_start {
        spawn_worker();
    }
}

pub fn shutdown_server() {
    let pid = SERVER_PID.swap(0, Ordering::SeqCst);
    if pid != 0 {
        eprintln!("[analyzer] Killing server process (pid={pid}) on app exit");
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
    }
}

pub fn delete_cache(file_hash: &str) {
    let cache = CacheDir::new();
    cache.delete_song_cache(file_hash);
    update_song_analyzed(file_hash, false, None, None);
}

pub fn reanalyze_transcript(file_hash: &str) {
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
        let _ = std::fs::remove_file(cache.lyrics_path(file_hash));
    }
    update_song_analyzed(file_hash, false, None, None);
    enqueue_one(file_hash);
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
    let store = SongsStore::load_all();
    let Some(song) = store.processed.iter().find(|s| s.file_hash == file_hash) else {
        eprintln!("[analyzer] Song with hash {file_hash} not found in store, skipping");
        return;
    };
    let song = song.clone();

    eprintln!(
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
            eprintln!("[analyzer] Failed to start server: {e}");
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
                eprintln!("[analyzer] CUDA OOM, killing server to free GPU memory");
                *guard = None;

                if !retried {
                    retried = true;
                    eprintln!("[analyzer] Respawning server and retrying with clean GPU");
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
                eprintln!("[analyzer] Server crashed: {e}");
                *guard = None;

                if !retried {
                    retried = true;
                    eprintln!("[analyzer] Respawning server and retrying");
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
        let (source, language) = read_transcript_meta(cache, file_hash);
        remove_from_queue(file_hash);
        update_song_analyzed(file_hash, true, language, Some(source));
        eprintln!("[analyzer] Analysis complete for {file_hash}");
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
        eprintln!("[analyzer] {line}");

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

    eprintln!(
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
            eprintln!("[lrclib] Search request failed: {e}");
            return None;
        }
    };
    let results: Vec<serde_json::Value> = match resp.into_body().read_json() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[lrclib] Failed to parse search results: {e}");
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

    eprintln!(
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
        eprintln!(
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
        eprintln!("[lrclib] Extracted 0 lines, skipping");
        return None;
    }

    eprintln!("[lrclib] Extracted {} lines", lines.len());
    let lyrics_json = serde_json::json!({"lines": lines});

    let out = cache.lyrics_path(&song.file_hash);
    match std::fs::write(&out, serde_json::to_string_pretty(&lyrics_json).unwrap()) {
        Ok(_) => {
            eprintln!("[lrclib] Lyrics saved to {}", out.display());
            Some(out)
        }
        Err(e) => {
            eprintln!("[lrclib] Failed to write lyrics: {e}");
            None
        }
    }
}
