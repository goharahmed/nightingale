mod cache;
mod config;
mod error;
mod profile;
mod scanner;
mod song;
mod vendor;

use blake3::Hasher;
use std::{fs::File, io::Read, path::Path};

pub use cache::{CacheStats, clear_models, clear_videos};
pub use config::AppConfig;
pub use profile::ProfileStore;
pub use scanner::{SongsStore, start_scan};

fn compute_file_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Hasher::new();
    let mut buf = [0u8; 8192];

    loop {
        let n = file.read(&mut buf)?;

        if n == 0 {
            break;
        }

        hasher.update(&buf[..n]);
    }

    Ok(hasher.finalize().to_hex()[..32].to_string())
}
