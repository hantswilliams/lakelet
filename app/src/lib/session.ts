// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The shell's commands (app brief A7, A10). Inside Tauri each window asks the shell for its
// project and its session once, and opens folders through it; in a browser (development,
// Playwright) the session comes from the URL, ?port=…&token=…, against a `lakelet serve`
// started with LAKELET_DEV_ORIGIN (A12), and there is no folder dialog.

export interface Session {
  port: number;
  token: string;
  pid: number;
  project: string;
  /** Spawn to `serving` line and serve.json read, as the shell measured it (§3.2). */
  ready_ms: number;
  /** `lakelet init`'s output when opening this folder initialised it. */
  initialised: string | null;
}

export interface RecentProject {
  path: string;
  name: string;
  opened: number;
}

export type SidecarEvent =
  | { kind: 'ready'; session: Session }
  | { kind: 'restarted'; session: Session }
  | { kind: 'down'; stderr: string };

export const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = await import('@tauri-apps/api/core');
  return tauri.invoke<T>(command, args);
}

const params = () => new URLSearchParams(window.location.search);

/** The window's project, or null for the welcome screen. */
export async function windowProject(): Promise<string | null> {
  if (inTauri()) return invoke<string | null>('window_project');
  const p = params();
  return p.get('port') ? (p.get('project') ?? '') : null;
}

/** The session; inside Tauri this waits while the sidecar starts. */
export async function getSession(): Promise<Session> {
  if (inTauri()) return invoke<Session>('get_session');
  const p = params();
  const port = Number(p.get('port'));
  const token = p.get('token') ?? '';
  if (!port || !token) throw new Error('no session: open through the Lakelet app, or pass ?port=&token= from serve.json');
  return { port, token, pid: 0, project: p.get('project') ?? '', ready_ms: Number(p.get('ready_ms') ?? 0), initialised: null };
}

export async function recentProjects(): Promise<RecentProject[]> {
  return inTauri() ? invoke<RecentProject[]>('recent_projects') : [];
}

/** The native folder dialog; null when cancelled. Only the app has one. */
export async function pickFolder(): Promise<string | null> {
  if (!inTauri()) throw new Error('the folder dialog is only in the app; in a browser, pass ?port=&token= from serve.json');
  return invoke<string | null>('pick_folder');
}

/** Open a folder as a project: this window when it has none, else a new one (A10). */
export async function openProject(path: string): Promise<void> {
  if (!inTauri()) throw new Error('opening a project is only in the app');
  return invoke<void>('open_project', { path });
}

/** The native file dialog, many files allowed; [] when cancelled. Only the app has one. */
export async function pickFiles(): Promise<string[]> {
  if (!inTauri()) throw new Error('the file dialog is only in the app; in a browser, type the path');
  return invoke<string[]>('pick_files');
}

/** Paths dropped on the window (Tauri's drag-drop event, A9); nothing in a browser, where a
 *  drop has no path. `over` and `leave` drive the drop zone's highlight. */
export async function onDrop(handler: (e: { kind: 'over' | 'leave' | 'drop'; paths: string[] }) => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  return getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === 'drop') handler({ kind: 'drop', paths: p.paths });
    else if (p.type === 'leave') handler({ kind: 'leave', paths: [] });
    else handler({ kind: 'over', paths: 'paths' in p ? p.paths : [] });
  });
}

export async function onSidecarEvent(handler: (e: SidecarEvent) => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SidecarEvent>('sidecar', (e) => handler(e.payload));
}
