use std::path::PathBuf;

use rand::prelude::{IndexedRandom, SliceRandom};
use serde::Serialize;

use crate::cache::{CacheDir, videos_dir};
use crate::error::NightingaleError;

#[derive(Debug, Clone, Serialize)]
pub struct AudioPaths {
    pub instrumental: String,
    pub vocals: String,
}

pub fn load_transcript(file_hash: &str) -> Result<serde_json::Value, NightingaleError> {
    let cache = CacheDir::new();
    let path = cache.transcript_path(file_hash);
    let data = std::fs::read_to_string(&path)?;
    let value = serde_json::from_str(&data)?;
    Ok(value)
}

pub fn get_audio_paths(file_hash: &str) -> AudioPaths {
    let cache = CacheDir::new();
    AudioPaths {
        instrumental: cache
            .instrumental_path(file_hash)
            .to_string_lossy()
            .into_owned(),
        vocals: cache
            .vocals_path(file_hash)
            .to_string_lossy()
            .into_owned(),
    }
}

const PIXABAY_PER_PAGE: u32 = 200;
const MAX_CACHED_VIDEOS: usize = 12;

struct FlavorConfig {
    keywords: &'static [&'static str],
    category: &'static str,
}

fn flavor_config(flavor: &str) -> FlavorConfig {
    match flavor {
        "underwater" => FlavorConfig {
            keywords: &[
                "underwater coral reef",
                "deep sea fish",
                "ocean jellyfish",
                "tropical fish underwater",
                "sea turtle underwater",
            ],
            category: "animals",
        },
        "space" => FlavorConfig {
            keywords: &[
                "galaxy stars universe",
                "nebula deep space",
                "aurora borealis sky",
                "earth orbit space",
                "milky way night sky",
            ],
            category: "science",
        },
        "city" => FlavorConfig {
            keywords: &[
                "city skyline night",
                "city traffic timelapse",
                "neon lights city",
                "urban aerial night",
                "highway traffic night",
            ],
            category: "buildings",
        },
        "countryside" => FlavorConfig {
            keywords: &[
                "countryside meadow aerial",
                "farm fields drone",
                "rolling hills green",
                "village landscape scenic",
                "pastoral landscape sunset",
            ],
            category: "places",
        },
        _ => FlavorConfig {
            keywords: &[
                "nature landscape aerial",
                "forest trees cinematic",
                "mountain scenery drone",
                "sunset clouds timelapse",
                "waterfall tropical scenic",
            ],
            category: "nature",
        },
    }
}

fn urlencode_query(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b' ' => "+".to_string(),
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn flavor_cache_dir(flavor: &str) -> PathBuf {
    let dir = videos_dir().join(flavor);
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn cached_video_paths(flavor: &str) -> Vec<PathBuf> {
    let dir = flavor_cache_dir(flavor);
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "mp4"))
        .collect();
    files.sort();
    files
}

struct PendingDownload {
    url: String,
    dest: PathBuf,
}

fn fetch_video_listing(flavor: &str) -> Result<Vec<PendingDownload>, String> {
    let api_key = option_env!("PIXABAY_API_KEY")
        .map(|s| s.to_string())
        .or_else(|| std::env::var("PIXABAY_API_KEY").ok())
        .unwrap_or_default();

    if api_key.is_empty() {
        return Err("PIXABAY_API_KEY not set".into());
    }

    let config = flavor_config(flavor);
    let mut rng = rand::rng();
    let dir = flavor_cache_dir(flavor);

    let keyword = config
        .keywords
        .choose(&mut rng)
        .unwrap_or(&config.keywords[0]);
    let order = if rand::random::<bool>() {
        "popular"
    } else {
        "latest"
    };

    let url = format!(
        "https://pixabay.com/api/videos/?key={}&q={}&video_type=film&category={}&per_page={}&safesearch=true&order={}",
        api_key,
        urlencode_query(keyword),
        config.category,
        PIXABAY_PER_PAGE,
        order,
    );

    let body: serde_json::Value = ureq::get(&url)
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_json()
        .map_err(|e| e.to_string())?;

    let hits = body["hits"]
        .as_array()
        .ok_or("No hits in Pixabay response")?;

    let mut results: Vec<PendingDownload> = hits
        .iter()
        .filter_map(|hit| {
            let video_id = hit["id"].as_u64().unwrap_or(0);
            let video_url = hit["videos"]["large"]["url"]
                .as_str()
                .or_else(|| hit["videos"]["medium"]["url"].as_str())?;
            Some(PendingDownload {
                url: video_url.to_string(),
                dest: dir.join(format!("{video_id}.mp4")),
            })
        })
        .collect();

    results.shuffle(&mut rng);
    Ok(results)
}

fn download_file(url: &str, dest: &PathBuf) -> Result<(), String> {
    let resp = ureq::get(url).call().map_err(|e| e.to_string())?;
    let mut reader = resp.into_body().into_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut file).map_err(|e| e.to_string())?;
    Ok(())
}

const ROTATE_COUNT: usize = 2;

pub fn get_cached_pixabay_videos(flavor: &str) -> Vec<String> {
    let mut cached = cached_video_paths(flavor);
    let mut rng = rand::rng();
    cached.shuffle(&mut rng);
    cached
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

pub fn download_pixabay_videos(flavor: &str, on_downloaded: impl Fn(String) + Send + 'static) {
    let listing = match fetch_video_listing(flavor) {
        Ok(l) => l,
        Err(_) => return,
    };

    let current = cached_video_paths(flavor);
    let needed = MAX_CACHED_VIDEOS.saturating_sub(current.len());

    let mut downloaded = 0;
    for dl in listing.iter().filter(|p| !p.dest.exists()) {
        if downloaded >= needed {
            break;
        }
        if download_file(&dl.url, &dl.dest).is_ok() {
            downloaded += 1;
            on_downloaded(dl.dest.to_string_lossy().into_owned());
        }
    }

    let mut rotated = 0;
    for dl in listing.iter().filter(|p| !p.dest.exists()) {
        if rotated >= ROTATE_COUNT {
            break;
        }
        if download_file(&dl.url, &dl.dest).is_ok() {
            on_downloaded(dl.dest.to_string_lossy().into_owned());

            let mut cached = cached_video_paths(flavor);
            cached.sort();
            if cached.len() > MAX_CACHED_VIDEOS {
                let evicted = &cached[0];
                std::fs::remove_file(evicted).ok();
            }
            rotated += 1;
        }
    }
}

pub fn prefetch_one_per_flavor() {
    let flavors = ["nature", "underwater", "space", "city", "countryside"];
    for flavor in flavors {
        let existing = cached_video_paths(flavor);
        if !existing.is_empty() {
            continue;
        }
        if let Ok(listing) = fetch_video_listing(flavor) {
            if let Some(dl) = listing.into_iter().find(|p| !p.dest.exists()) {
                let _ = download_file(&dl.url, &dl.dest);
            }
        }
    }
}
