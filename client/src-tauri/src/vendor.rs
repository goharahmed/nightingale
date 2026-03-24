use app_core::{
    clear_vendor_dir, is_ready as is_vendor_ready, mark_ready, prefetch_one_per_flavor,
    step_create_venv, step_download_ffmpeg, step_download_uv, step_extract_scripts,
    step_install_packages, step_install_python,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
enum SetupStep {
    ClearVendor,
    Ffmpeg,
    Uv,
    Python,
    Venv,
    Dependencies,
    ExtractScripts,
    Videos,
    Finish,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
struct SetupProgress {
    step: SetupStep,
    percent: usize,
    action: String,
}

fn emit_setup_progress(
    app: &AppHandle,
    step: SetupStep,
    percent: usize,
    action: impl Into<String>,
) {
    let _ = app.emit(
        "setup-progress",
        SetupProgress {
            step,
            percent,
            action: action.into(),
        },
    );
}

#[tauri::command]
pub fn trigger_setup(app: AppHandle) {
    std::thread::spawn(move || {
        let run = || -> Result<(), String> {
            emit_setup_progress(&app, SetupStep::ClearVendor, 6, "Clearing vendor folder...");
            clear_vendor_dir()?;

            emit_setup_progress(&app, SetupStep::Ffmpeg, 12, "Downloading ffmpeg...");
            step_download_ffmpeg()?;

            emit_setup_progress(&app, SetupStep::Uv, 24, "Downloading uv...");
            step_download_uv()?;

            emit_setup_progress(
                &app,
                SetupStep::Python,
                36,
                "Installing python3.10 via uv...",
            );
            step_install_python()?;

            emit_setup_progress(&app, SetupStep::Venv, 48, "Setting up .venv...");
            step_create_venv()?;

            emit_setup_progress(
                &app,
                SetupStep::Dependencies,
                60,
                "Installing python dependencies (torch, audio-separator, demucs)...",
            );
            step_install_packages()?;

            emit_setup_progress(
                &app,
                SetupStep::ExtractScripts,
                72,
                "Extracting analyzer scripts...",
            );
            step_extract_scripts()?;

            emit_setup_progress(
                &app,
                SetupStep::Videos,
                84,
                "Pre-downloading video backgrounds...",
            );
            prefetch_one_per_flavor(|detail| {
                emit_setup_progress(&app, SetupStep::Videos, 84, detail);
            });

            mark_ready()?;

            emit_setup_progress(&app, SetupStep::Finish, 100, "Done");

            Ok(())
        };

        if let Err(e) = run() {
            let _ = app.emit("setup-error", e);
        }
    });
}

#[tauri::command]
pub fn is_ready() -> bool {
    is_vendor_ready()
}
