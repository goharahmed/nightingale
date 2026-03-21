use app_core::{
    is_ready as is_vendor_ready, mark_ready, step_create_venv, step_download_ffmpeg,
    step_download_uv, step_extract_scripts, step_install_packages, step_install_python,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
enum SetupStep {
    Ffmpeg,
    Uv,
    Python,
    Venv,
    Dependencies,
    ExtractScripts,
    Finish,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
struct SetupProgress {
    step: SetupStep,
    percent: usize,
    action: &'static str,
}

#[tauri::command]
pub fn trigger_setup(app: AppHandle) {
    std::thread::spawn(move || {
        let emit = |step: SetupStep, percent: usize, action: &'static str| {
            app.emit(
                "setup-progress",
                SetupProgress {
                    step,
                    percent,
                    action,
                },
            )
            .unwrap();
        };

        let run = || -> Result<(), String> {
            emit(SetupStep::Ffmpeg, 15, "Downloading ffmpeg...");
            step_download_ffmpeg()?;

            emit(SetupStep::Uv, 30, "Downloading uv...");
            step_download_uv()?;

            emit(SetupStep::Python, 45, "Installing python3.10 via uv...");
            step_install_python()?;

            emit(SetupStep::Venv, 60, "Setting up .venv...");
            step_create_venv()?;

            emit(
                SetupStep::Dependencies,
                75,
                "Installing python dependencies (torch, audio-separator, demucs)...",
            );
            step_install_packages()?;

            emit(
                SetupStep::ExtractScripts,
                90,
                "Extracting analyzer scripts...",
            );

            step_extract_scripts()?;

            mark_ready()?;

            emit(SetupStep::Finish, 100, "Done");

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
