// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
//! Projects (app brief A8, A10). Which folder a window opens, `lakelet init` when the folder
//! is not a project yet, the recent list in the app's data directory, the memory share each
//! window's sidecar is given, and the registry of open windows: one project per window, one
//! sidecar per window, stopped when the window closes. No Tauri in here, so `cargo test`
//! exercises all of it against the fake sidecar.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::supervisor::{Session, SidecarConfig, SidecarEvent, Supervisor};

/// A folder is a project when `lakelet.toml` is in it (core step 2).
pub fn is_project(path: &Path) -> bool {
    path.join("lakelet.toml").is_file()
}

/// The folder's name as the window title and the recent list show it.
pub fn project_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.display().to_string())
}

/// A8: the first window's sidecar gets 60% of RAM; each further window open at the same
/// time halves it. DuckDB takes the value as `<n>MiB`; nothing goes below 256 MiB.
pub fn memory_share(ram_bytes: u64, windows_open: usize) -> String {
    const MIB: u64 = 1024 * 1024;
    let first = ram_bytes / 10 * 6;
    let share = first.checked_shr(windows_open as u32).unwrap_or(0);
    format!("{}MiB", (share / MIB).max(256))
}

/// A folder ready to open: initialised by this call when it was not a project yet, with
/// `lakelet init`'s output so the window can show it (A10).
#[derive(Clone, Debug, PartialEq)]
pub struct Prepared {
    pub project: PathBuf,
    pub initialised: Option<String>,
}

/// The folder's canonical path, which is how windows are matched to projects.
pub fn canonical(folder: &Path) -> Result<PathBuf, String> {
    if !folder.is_dir() {
        return Err(format!("{} is not a folder", folder.display()));
    }
    folder.canonicalize().map_err(|e| format!("{}: {e}", folder.display()))
}

/// Check the folder and run `lakelet init <folder>` when it has no `lakelet.toml`.
pub fn prepare(executable: &OsString, folder: &Path) -> Result<Prepared, String> {
    let project = canonical(folder)?;
    if is_project(&project) {
        return Ok(Prepared { project, initialised: None });
    }
    let output = Command::new(executable)
        .arg("init")
        .arg(&project)
        .output()
        .map_err(|e| format!("could not run lakelet init: {e}"))?;
    let text = format!("{}{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        return Err(format!("lakelet init {} failed:\n{}", project.display(), text.trim()));
    }
    if !is_project(&project) {
        return Err(format!("lakelet init {} wrote no lakelet.toml:\n{}", project.display(), text.trim()));
    }
    Ok(Prepared { project, initialised: Some(text.trim().to_string()) })
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RecentProject {
    pub path: PathBuf,
    pub name: String,
    /// Unix seconds of the last open.
    pub opened: u64,
}

pub const MAX_RECENT: usize = 10;

/// The recent list: a JSON file, most recent first, ten entries (A10).
pub struct RecentProjects {
    file: PathBuf,
}

impl RecentProjects {
    pub fn at(file: impl Into<PathBuf>) -> Self {
        Self { file: file.into() }
    }

    pub fn list(&self) -> Vec<RecentProject> {
        std::fs::read_to_string(&self.file)
            .ok()
            .and_then(|text| serde_json::from_str::<Vec<RecentProject>>(&text).ok())
            .unwrap_or_default()
    }

    /// Projects that are still there; a folder that was deleted or is no longer a project
    /// drops out of what the window shows without being forgotten.
    pub fn existing(&self) -> Vec<RecentProject> {
        self.list().into_iter().filter(|p| is_project(&p.path)).collect()
    }

    pub fn remember(&self, project: &Path) -> std::io::Result<()> {
        let mut list: Vec<RecentProject> = self.list().into_iter().filter(|p| p.path != project).collect();
        let opened = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        list.insert(0, RecentProject { path: project.to_path_buf(), name: project_name(project), opened });
        list.truncate(MAX_RECENT);
        if let Some(parent) = self.file.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.file, serde_json::to_string_pretty(&list)?)
    }
}

/// What a window is doing, as `get_session` sees it.
pub enum WindowState {
    /// The welcome screen: no project chosen yet.
    NoProject,
    /// The sidecar is being spawned; the window shows the amber dot meanwhile (§3.2).
    Starting { project: PathBuf },
    Running { supervisor: Supervisor },
    Failed { project: PathBuf, error: String },
}

/// The open windows, by label. One sidecar each; the memory share counts the others.
pub struct OpenProjects {
    pub executable: OsString,
    pub ram_bytes: u64,
    pub dev_origin: Option<String>,
    pub ready_timeout: Duration,
    windows: Mutex<HashMap<String, WindowState>>,
}

impl OpenProjects {
    pub fn new(executable: OsString, ram_bytes: u64, dev_origin: Option<String>) -> Self {
        Self { executable, ram_bytes, dev_origin, ready_timeout: Duration::from_secs(20), windows: Mutex::new(HashMap::new()) }
    }

    /// Register a window with no project yet (the welcome screen).
    pub fn add_empty(&self, label: &str) {
        self.windows.lock().unwrap().insert(label.to_string(), WindowState::NoProject);
    }

    /// The label of the window already showing this project, if any.
    pub fn window_for(&self, project: &Path) -> Option<String> {
        let windows = self.windows.lock().unwrap();
        windows.iter().find_map(|(label, state)| match state {
            WindowState::Starting { project: p } | WindowState::Failed { project: p, .. } if p == project => Some(label.clone()),
            WindowState::Running { supervisor } if supervisor.session().project == project => Some(label.clone()),
            _ => None,
        })
    }

    pub fn project_of(&self, label: &str) -> Option<PathBuf> {
        let windows = self.windows.lock().unwrap();
        match windows.get(label)? {
            WindowState::NoProject => None,
            WindowState::Starting { project } | WindowState::Failed { project, .. } => Some(project.clone()),
            WindowState::Running { supervisor } => Some(supervisor.session().project.clone()),
        }
    }

    pub fn labels(&self) -> Vec<String> {
        self.windows.lock().unwrap().keys().cloned().collect()
    }

    /// Start the project's sidecar for this window, blocking until it is ready or has
    /// failed. The memory share is 60% of RAM halved for every other window with a sidecar
    /// at this moment (A8); windows already open keep theirs.
    pub fn open(&self, label: &str, prepared: Prepared) -> Result<Session, String> {
        let limit = {
            let mut windows = self.windows.lock().unwrap();
            let others = windows
                .iter()
                .filter(|(l, s)| l.as_str() != label && matches!(s, WindowState::Starting { .. } | WindowState::Running { .. }))
                .count();
            if let Some(WindowState::Running { supervisor }) = windows.get_mut(label) {
                supervisor.stop();
            }
            windows.insert(label.to_string(), WindowState::Starting { project: prepared.project.clone() });
            memory_share(self.ram_bytes, others)
        };
        let config = SidecarConfig {
            executable: self.executable.clone(),
            project: prepared.project.clone(),
            memory_limit: Some(limit),
            dev_origin: self.dev_origin.clone(),
            ready_timeout: self.ready_timeout,
        };
        let started = Supervisor::start(config);
        let mut windows = self.windows.lock().unwrap();
        match started {
            Ok(mut supervisor) => {
                supervisor.session_mut().initialised = prepared.initialised;
                let session = supervisor.session().clone();
                windows.insert(label.to_string(), WindowState::Running { supervisor });
                Ok(session)
            }
            Err(e) => {
                let error = format!(
                    "{e}\nsidecar: {}\nproject: {}",
                    self.executable.to_string_lossy(),
                    prepared.project.display()
                );
                windows.insert(label.to_string(), WindowState::Failed { project: prepared.project, error: error.clone() });
                Err(error)
            }
        }
    }

    /// The window has a project and its sidecar is on the way (`open` follows).
    pub fn starting(&self, label: &str, project: PathBuf) {
        self.windows.lock().unwrap().insert(label.to_string(), WindowState::Starting { project });
    }

    /// A window whose project could not be prepared: the reason for `get_session`.
    pub fn fail(&self, label: &str, project: PathBuf, error: String) {
        self.windows.lock().unwrap().insert(label.to_string(), WindowState::Failed { project, error });
    }

    /// The window's session: waits while the sidecar is starting.
    pub fn session(&self, label: &str, timeout: Duration) -> Result<Session, String> {
        let deadline = Instant::now() + timeout;
        loop {
            {
                let windows = self.windows.lock().unwrap();
                match windows.get(label) {
                    None => return Err(format!("no window {label}")),
                    Some(WindowState::NoProject) => return Err("no project".to_string()),
                    Some(WindowState::Running { supervisor }) => return Ok(supervisor.session().clone()),
                    Some(WindowState::Failed { error, .. }) => return Err(error.clone()),
                    Some(WindowState::Starting { .. }) => {}
                }
            }
            if Instant::now() > deadline {
                return Err("the sidecar is still starting".to_string());
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    /// Poll every sidecar once (A11); the events to forward, by window.
    pub fn check_all(&self) -> Vec<(String, SidecarEvent)> {
        let mut windows = self.windows.lock().unwrap();
        let mut events = Vec::new();
        let mut down = Vec::new();
        for (label, state) in windows.iter_mut() {
            if let WindowState::Running { supervisor } = state {
                if let Some(event) = supervisor.check() {
                    if let SidecarEvent::Down { stderr } = &event {
                        down.push((label.clone(), supervisor.session().project.clone(), format!("the core stopped twice in a minute:\n{stderr}")));
                    }
                    events.push((label.clone(), event));
                }
            }
        }
        for (label, project, error) in down {
            windows.insert(label, WindowState::Failed { project, error });
        }
        events
    }

    /// The window closed: stop its sidecar. Returns the sidecar's pid when one was running.
    pub fn close(&self, label: &str) -> Option<u32> {
        let state = self.windows.lock().unwrap().remove(label)?;
        match state {
            WindowState::Running { mut supervisor } => {
                let pid = supervisor.session().pid;
                supervisor.stop();
                Some(pid)
            }
            _ => None,
        }
    }

    /// App exit: stop every sidecar.
    pub fn close_all(&self) {
        for label in self.labels() {
            self.close(&label);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::supervisor::tests::{fake_executable, temp_dir};

    #[test]
    fn the_memory_share_is_sixty_percent_then_halves() {
        let ram = 16 * 1024 * 1024 * 1024u64;
        assert_eq!(memory_share(ram, 0), "9830MiB");
        assert_eq!(memory_share(ram, 1), "4915MiB");
        assert_eq!(memory_share(ram, 2), "2457MiB");
        assert_eq!(memory_share(1024 * 1024 * 1024, 4), "256MiB", "never below the floor");
    }

    #[test]
    fn the_recent_list_is_most_recent_first_without_repeats_and_ten_long() {
        let dir = temp_dir("recent");
        let recent = RecentProjects::at(dir.join("data").join("recent.json"));
        assert!(recent.list().is_empty());
        for i in 0..12 {
            let p = dir.join(format!("p{i}"));
            std::fs::create_dir_all(&p).unwrap();
            std::fs::write(p.join("lakelet.toml"), "").unwrap();
            recent.remember(&p).unwrap();
        }
        recent.remember(&dir.join("p3")).unwrap();
        let list = recent.list();
        assert_eq!(list.len(), MAX_RECENT);
        assert_eq!(list[0].path, dir.join("p3"));
        assert_eq!(list[0].name, "p3");
        assert_eq!(list[1].path, dir.join("p11"));
        assert_eq!(list.iter().filter(|p| p.name == "p3").count(), 1, "remembered once");
        std::fs::remove_file(dir.join("p11").join("lakelet.toml")).unwrap();
        assert!(recent.existing().iter().all(|p| p.name != "p11"), "a folder that is no longer a project is not offered");
        assert_eq!(recent.list().len(), MAX_RECENT, "but is not forgotten");
    }

    #[test]
    fn a_folder_that_is_not_a_project_is_initialised_first() {
        let dir = temp_dir("prepare");
        let exe = fake_executable(&dir, 60);
        let folder = dir.join("fresh");
        std::fs::create_dir_all(&folder).unwrap();
        let prepared = prepare(&exe, &folder).expect("init runs");
        assert!(is_project(&prepared.project));
        assert!(prepared.initialised.as_deref().unwrap_or("").contains("lakelet.toml"), "{prepared:?}");
        let again = prepare(&exe, &folder).unwrap();
        assert_eq!(again.initialised, None, "an existing project is left alone");
        assert!(prepare(&exe, &dir.join("missing")).unwrap_err().contains("not a folder"));
    }

    #[test]
    fn two_windows_get_two_sidecars_with_halved_limits_and_closing_kills() {
        let dir = temp_dir("windows");
        let exe = fake_executable(&dir, 60);
        let ram = 10 * 1024 * 1024 * 1024u64;
        let open = OpenProjects::new(exe.clone(), ram, Some("http://localhost:5173".into()));
        let a = prepare(&exe, &{ let p = dir.join("a"); std::fs::create_dir_all(&p).unwrap(); p }).unwrap();
        let b = prepare(&exe, &{ let p = dir.join("b"); std::fs::create_dir_all(&p).unwrap(); p }).unwrap();

        let sa = open.open("project-1", a.clone()).expect("first sidecar starts");
        assert!(sa.ready_ms > 0 && sa.ready_ms < 10_000, "spawn to ready is measured: {}", sa.ready_ms);
        assert!(sa.initialised.as_deref().unwrap_or("").contains("lakelet.toml"), "the init output reaches the window");
        let sb = open.open("project-2", b.clone()).expect("second sidecar starts");
        assert_ne!(sa.pid, sb.pid);
        let args_a = std::fs::read_to_string(a.project.join(".lakelet").join("fake-args.txt")).unwrap();
        let args_b = std::fs::read_to_string(b.project.join(".lakelet").join("fake-args.txt")).unwrap();
        assert!(args_a.contains("--memory-limit 6144MiB"), "{args_a}");
        assert!(args_b.contains("--memory-limit 3072MiB"), "halved for the second window: {args_b}");

        assert_eq!(open.window_for(&b.project), Some("project-2".to_string()));
        assert_eq!(open.project_of("project-1"), Some(a.project.clone()));
        assert_eq!(open.session("project-2", Duration::from_secs(1)).unwrap().pid, sb.pid);
        assert!(open.check_all().is_empty(), "both healthy");

        let pid = open.close("project-2").expect("a sidecar was running");
        assert_eq!(pid, sb.pid);
        assert!(!alive(pid), "closing the window killed its sidecar; no orphan");
        assert!(alive(sa.pid), "the other window's sidecar is untouched");
        assert_eq!(open.window_for(&b.project), None);
        open.close_all();
        assert!(!alive(sa.pid));
        assert!(open.labels().is_empty());
    }

    #[cfg(unix)]
    fn alive(pid: u32) -> bool {
        // `kill -0` on a reaped child fails, which is the point: the supervisor waits on it.
        Command::new("kill").arg("-0").arg(pid.to_string()).output().map(|o| o.status.success()).unwrap_or(false)
    }

    #[cfg(windows)]
    fn alive(pid: u32) -> bool {
        let out = Command::new("tasklist").arg("/FI").arg(format!("PID eq {pid}")).output().unwrap();
        String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
    }
}
