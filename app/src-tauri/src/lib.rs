// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
//! The Lakelet desktop shell (app brief `build-sessions/app-v0-plan.md`). Step 0: one
//! window, one sidecar, the session handed to the webview, sidecar events forwarded.

pub mod supervisor;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use supervisor::{Session, SidecarConfig, SidecarEvent, Supervisor};

/// The window's sidecar, or the error that stopped it from starting.
pub struct Shell {
    supervisor: Mutex<Option<Supervisor>>,
    error: Mutex<Option<String>>,
}

/// The project this window opens: `LAKELET_PROJECT`, else the first argument, else the
/// current directory. Step 1 replaces this with the folder dialog and the recent list (A10).
pub fn project_from_environment() -> PathBuf {
    if let Some(p) = std::env::var_os("LAKELET_PROJECT") {
        return PathBuf::from(p);
    }
    if let Some(p) = std::env::args().nth(1) {
        return PathBuf::from(p);
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// A7: the webview asks once and calls `/api` itself with the bearer token.
#[tauri::command]
fn get_session(shell: State<'_, Arc<Shell>>) -> Result<Session, String> {
    if let Some(error) = shell.error.lock().unwrap().clone() {
        return Err(error);
    }
    shell
        .supervisor
        .lock()
        .unwrap()
        .as_ref()
        .map(|s| s.session().clone())
        .ok_or_else(|| "the sidecar is not running".to_string())
}

fn monitor(app: AppHandle, shell: Arc<Shell>) {
    loop {
        thread::sleep(Duration::from_millis(500));
        let event = {
            let mut guard = shell.supervisor.lock().unwrap();
            match guard.as_mut() {
                Some(sup) => sup.check(),
                None => return,
            }
        };
        if let Some(event) = event {
            if let SidecarEvent::Down { stderr } = &event {
                *shell.error.lock().unwrap() = Some(format!("the core stopped twice in a minute:\n{stderr}"));
            }
            let _ = app.emit("sidecar", &event);
            if matches!(event, SidecarEvent::Down { .. }) {
                return;
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let project = project_from_environment();
            let config = SidecarConfig::new(project);
            let shell = Arc::new(match Supervisor::start(config) {
                Ok(sup) => Shell { supervisor: Mutex::new(Some(sup)), error: Mutex::new(None) },
                Err(e) => Shell {
                    supervisor: Mutex::new(None),
                    error: Mutex::new(Some(format!(
                        "{e}\nsidecar: {}\nproject: {}",
                        supervisor::sidecar_executable().to_string_lossy(),
                        project_from_environment().display()
                    ))),
                },
            });
            app.manage(shell.clone());
            if let Some(sup) = shell.supervisor.lock().unwrap().as_ref() {
                let _ = app.emit("sidecar", SidecarEvent::Ready { session: sup.session().clone() });
            }
            let handle = app.handle().clone();
            thread::spawn(move || monitor(handle, shell));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(shell) = window.try_state::<Arc<Shell>>() {
                    if let Some(sup) = shell.supervisor.lock().unwrap().as_mut() {
                        sup.stop();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_session])
        .run(tauri::generate_context!())
        .expect("error while running the Lakelet shell");
}
