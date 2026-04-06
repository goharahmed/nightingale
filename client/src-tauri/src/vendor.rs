use app_core::{
    change_app_data_path, clear_vendor_dir, is_ready as is_vendor_ready, mark_ready,
    nightingale_dir, prefetch_one_per_flavor, step_create_venv, step_download_ffmpeg,
    step_download_uv, step_extract_scripts, step_install_packages, step_install_python,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
enum SetupStep {
    MigrateData,
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

fn resolve_data_path_input(input: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(input);
    if path.is_absolute() {
        Ok(path)
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|e| format!("Failed to resolve data path: {e}"))
    }
}

fn same_path(lhs: &Path, rhs: &Path) -> bool {
    match (
        std::fs::canonicalize(lhs).ok(),
        std::fs::canonicalize(rhs).ok(),
    ) {
        (Some(a), Some(b)) => a == b,
        _ => lhs == rhs,
    }
}

#[tauri::command]
pub fn trigger_setup(app: AppHandle, data_path: Option<String>) {
    std::thread::spawn(move || {
        let run = || -> Result<(), String> {
            let mut cleared_vendor = false;
            if let Some(raw_path) = data_path
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                let target = resolve_data_path_input(raw_path)?;
                let current = nightingale_dir();
                if !same_path(&current, &target) {
                    emit_setup_progress(
                        &app,
                        SetupStep::ClearVendor,
                        6,
                        "Clearing vendor folder before migration...",
                    );
                    clear_vendor_dir()?;
                    cleared_vendor = true;

                    emit_setup_progress(&app, SetupStep::MigrateData, 12, "Migrating app data...");
                    let new_path = change_app_data_path(target)?;
                    app.asset_protocol_scope()
                        .allow_directory(&new_path, true)
                        .map_err(|e| {
                            format!(
                                "Failed to update asset protocol scope for migrated data path {:?}: {e}",
                                new_path
                            )
                        })?;
                    emit_setup_progress(
                        &app,
                        SetupStep::MigrateData,
                        18,
                        format!("Data migrated to {}", new_path.display()),
                    );
                }
            }

            if !cleared_vendor {
                emit_setup_progress(
                    &app,
                    SetupStep::ClearVendor,
                    14,
                    "Clearing vendor folder...",
                );
                clear_vendor_dir()?;
            }

            emit_setup_progress(&app, SetupStep::Ffmpeg, 24, "Downloading ffmpeg...");
            step_download_ffmpeg()?;

            emit_setup_progress(&app, SetupStep::Uv, 34, "Downloading uv...");
            step_download_uv()?;

            emit_setup_progress(
                &app,
                SetupStep::Python,
                46,
                "Installing python3.10 via uv...",
            );
            step_install_python()?;

            emit_setup_progress(&app, SetupStep::Venv, 58, "Setting up .venv...");
            step_create_venv()?;

            emit_setup_progress(
                &app,
                SetupStep::Dependencies,
                70,
                "Installing python dependencies...",
            );
            step_install_packages()?;

            emit_setup_progress(
                &app,
                SetupStep::ExtractScripts,
                80,
                "Extracting analyzer scripts...",
            );
            step_extract_scripts()?;

            emit_setup_progress(
                &app,
                SetupStep::Videos,
                90,
                "Pre-downloading video backgrounds...",
            );
            prefetch_one_per_flavor(|detail| {
                emit_setup_progress(&app, SetupStep::Videos, 90, detail);
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
