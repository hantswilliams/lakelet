// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
//! The Lakelet desktop shell (app brief `build-sessions/app-v0-plan.md`). Step 1: one window
//! per project, one sidecar per window with its memory share (A8), a folder dialog and
//! `lakelet init` for a folder that is not a project yet, the recent list (A10), the session
//! handed to each webview, sidecar events forwarded, the sidecar stopped when its window
//! closes. The logic is in `projects` and `supervisor`, tested without Tauri; this file is
//! the wiring.

pub mod projects;
pub mod supervisor;

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

use projects::{canonical, prepare, OpenProjects, RecentProject, RecentProjects};
use supervisor::{Session, DEV_ORIGIN};

pub struct Shell {
    open: OpenProjects,
    recent: RecentProjects,
    windows_made: AtomicUsize,
}

/// The project the first window opens: `LAKELET_PROJECT`, else the first argument, else the
/// most recent project that still exists; none of those means the welcome screen.
pub fn first_project(recent: &RecentProjects) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("LAKELET_PROJECT") {
        return Some(PathBuf::from(p));
    }
    if let Some(p) = std::env::args().nth(1).filter(|a| !a.starts_with('-')) {
        return Some(PathBuf::from(p));
    }
    recent.existing().into_iter().next().map(|p| p.path)
}

fn total_ram() -> u64 {
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    system.total_memory()
}

fn window_title(project: Option<&PathBuf>) -> String {
    match project {
        Some(p) => format!("Lakelet — {}", projects::project_name(p)),
        None => "Lakelet".to_string(),
    }
}

/// Make a window; every window loads the same page and asks for its own session.
fn new_window(app: &AppHandle, shell: &Shell, project: Option<&PathBuf>) -> Result<String, String> {
    let n = shell.windows_made.fetch_add(1, Ordering::SeqCst) + 1;
    let label = format!("project-{n}");
    WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title(window_title(project))
        .inner_size(1180.0, 760.0)
        .min_inner_size(820.0, 520.0)
        .build()
        .map_err(|e| format!("could not open a window: {e}"))?;
    Ok(label)
}

/// Give the window its project and, on a thread, `lakelet init` when the folder needs it
/// and then the sidecar; the webview's `get_session` waits, and the ready (or down) event
/// reaches the window either way.
fn start_in_window(app: AppHandle, shell: Arc<Shell>, label: String, folder: PathBuf) {
    shell.open.starting(&label, folder.clone());
    thread::spawn(move || {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.set_title(&window_title(Some(&folder)));
        }
        let prepared = match prepare(&shell.open.executable, &folder) {
            Ok(prepared) => prepared,
            Err(error) => {
                shell.open.fail(&label, folder, error.clone());
                let _ = app.emit_to(&label, "sidecar", supervisor::SidecarEvent::Down { stderr: error });
                return;
            }
        };
        let _ = shell.recent.remember(&prepared.project);
        match shell.open.open(&label, prepared) {
            Ok(session) => {
                let _ = app.emit_to(&label, "sidecar", supervisor::SidecarEvent::Ready { session });
            }
            Err(error) => {
                let _ = app.emit_to(&label, "sidecar", supervisor::SidecarEvent::Down { stderr: error });
            }
        }
    });
}

/// Open a folder: in this window when it has no project yet, in a new window otherwise;
/// when a window already shows it, bring that one forward.
fn open_folder(app: &AppHandle, shell: &Arc<Shell>, from_label: &str, folder: PathBuf) -> Result<(), String> {
    let project = canonical(&folder)?;
    if let Some(existing) = shell.open.window_for(&project) {
        if let Some(w) = app.get_webview_window(&existing) {
            let _ = w.set_focus();
        }
        return Ok(());
    }
    let label = if shell.open.project_of(from_label).is_none() && shell.open.labels().contains(&from_label.to_string()) {
        from_label.to_string()
    } else {
        new_window(app, shell, Some(&project))?
    };
    start_in_window(app.clone(), shell.clone(), label, project);
    Ok(())
}

/// A7: the webview asks once and calls `/api` itself with the bearer token. Waits while the
/// sidecar is starting; "no project" means the welcome screen.
#[tauri::command]
async fn get_session(window: tauri::Window, shell: State<'_, Arc<Shell>>) -> Result<Session, String> {
    let shell = shell.inner().clone();
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || shell.open.session(&label, Duration::from_secs(30)))
        .await
        .map_err(|e| e.to_string())?
}

/// The window's project, if it has one.
#[tauri::command]
fn window_project(window: tauri::Window, shell: State<'_, Arc<Shell>>) -> Option<String> {
    shell.open.project_of(window.label()).map(|p| p.display().to_string())
}

#[tauri::command]
fn recent_projects(shell: State<'_, Arc<Shell>>) -> Vec<RecentProject> {
    shell.recent.existing()
}

/// A10: the native folder dialog. `None` when the user cancels.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    let picked = app.dialog().file().set_title("Open a folder as a Lakelet project").blocking_pick_folder();
    picked.and_then(|p| p.into_path().ok()).map(|p| p.display().to_string())
}

/// A10: open a folder as a project, running `lakelet init` first when it needs it.
#[tauri::command]
async fn open_project(app: AppHandle, window: tauri::Window, shell: State<'_, Arc<Shell>>, path: String) -> Result<(), String> {
    let shell = shell.inner().clone();
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || open_folder(&app, &shell, &label, PathBuf::from(path)))
        .await
        .map_err(|e| e.to_string())?
}

fn monitor(app: AppHandle, shell: Arc<Shell>) {
    loop {
        thread::sleep(Duration::from_millis(500));
        for (label, event) in shell.open.check_all() {
            let _ = app.emit_to(&label, "sidecar", &event);
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("lakelet-app"));
            let recent = RecentProjects::at(data_dir.join("recent.json"));
            let dev_origin = if cfg!(debug_assertions) { Some(DEV_ORIGIN.to_string()) } else { None };
            let shell = Arc::new(Shell {
                open: OpenProjects::new(supervisor::sidecar_executable(), total_ram(), dev_origin),
                recent,
                windows_made: AtomicUsize::new(0),
            });
            app.manage(shell.clone());
            let handle = app.handle().clone();
            let project = first_project(&shell.recent);
            let label = new_window(&handle, &shell, project.as_ref())?;
            shell.open.add_empty(&label);
            if let Some(folder) = project {
                match canonical(&folder) {
                    Ok(project) => start_in_window(handle.clone(), shell.clone(), label, project),
                    // The window shows the reason and the welcome screen's buttons.
                    Err(error) => shell.open.fail(&label, folder, error),
                }
            }
            thread::spawn(move || monitor(handle, shell));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(shell) = window.try_state::<Arc<Shell>>() {
                    shell.open.close(window.label());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_session, window_project, recent_projects, pick_folder, open_project])
        .build(tauri::generate_context!())
        .expect("error while building the Lakelet shell")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(shell) = app.try_state::<Arc<Shell>>() {
                    shell.open.close_all();
                }
            }
        });
}
