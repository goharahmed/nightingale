use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::thread;

use tiny_http::{Header, Response, Server, StatusCode};

static PORT: AtomicU16 = AtomicU16::new(0);

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "ogg" | "oga" => "audio/ogg",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "m4a" | "aac" => "audio/mp4",
        "mp4" => "video/mp4",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

fn parse_range(range_header: &str, file_len: u64) -> Option<(u64, u64)> {
    let spec = range_header.strip_prefix("bytes=")?;
    let mut parts = spec.splitn(2, '-');
    let start_str = parts.next().unwrap_or("");
    let end_str = parts.next().unwrap_or("");

    if start_str.is_empty() {
        let suffix: u64 = end_str.parse().ok()?;
        Some((file_len.saturating_sub(suffix), file_len - 1))
    } else {
        let start: u64 = start_str.parse().ok()?;
        let end = if end_str.is_empty() {
            file_len - 1
        } else {
            end_str.parse::<u64>().ok()?.min(file_len - 1)
        };
        Some((start, end))
    }
}

fn handle_request(request: tiny_http::Request) {
    let raw_path = urlencoding::decode(request.url())
        .map(|d| d.into_owned())
        .unwrap_or_else(|_| request.url().to_string());

    let file_path = PathBuf::from(&raw_path);

    if !file_path.is_file() {
        let _ = request.respond(
            Response::from_string("Not found").with_status_code(StatusCode(404)),
        );
        return;
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let mime = mime_for_ext(ext);
    let content_type = Header::from_bytes("Content-Type", mime).unwrap();
    let cors = Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
    let accept_ranges = Header::from_bytes("Accept-Ranges", "bytes").unwrap();

    let file_len = match std::fs::metadata(&file_path) {
        Ok(m) => m.len(),
        Err(_) => {
            let _ = request.respond(
                Response::from_string("Read error").with_status_code(StatusCode(500)),
            );
            return;
        }
    };

    let range_val = request
        .headers()
        .iter()
        .find(|h| h.field.as_str() == "Range" || h.field.as_str() == "range")
        .map(|h| h.value.as_str().to_string());

    if let Some(range_str) = range_val {
        if let Some((start, end)) = parse_range(&range_str, file_len) {
            let mut file = match std::fs::File::open(&file_path) {
                Ok(f) => f,
                Err(_) => {
                    let _ = request.respond(
                        Response::from_string("Read error")
                            .with_status_code(StatusCode(500)),
                    );
                    return;
                }
            };

            let chunk_len = (end - start + 1) as usize;
            let mut buf = vec![0u8; chunk_len];
            let _ = file.seek(SeekFrom::Start(start));
            let _ = file.read_exact(&mut buf);

            let content_range = Header::from_bytes(
                "Content-Range",
                format!("bytes {start}-{end}/{file_len}"),
            )
            .unwrap();

            let resp = Response::from_data(buf)
                .with_status_code(StatusCode(206))
                .with_header(content_type)
                .with_header(cors)
                .with_header(accept_ranges)
                .with_header(content_range);

            let _ = request.respond(resp);
            return;
        }
    }

    match std::fs::read(&file_path) {
        Ok(data) => {
            let resp = Response::from_data(data)
                .with_header(content_type)
                .with_header(cors)
                .with_header(accept_ranges);
            let _ = request.respond(resp);
        }
        Err(_) => {
            let _ = request.respond(
                Response::from_string("Read error").with_status_code(StatusCode(500)),
            );
        }
    }
}

pub fn start() -> u16 {
    let server = Server::http("127.0.0.1:0").expect("failed to start media server");
    let port = server.server_addr().to_ip().unwrap().port();
    PORT.store(port, Ordering::SeqCst);

    thread::spawn(move || {
        for request in server.incoming_requests() {
            thread::spawn(move || {
                handle_request(request);
            });
        }
    });

    port
}

pub fn port() -> u16 {
    PORT.load(Ordering::SeqCst)
}
