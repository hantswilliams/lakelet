// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Where the sidecar is (app brief A7). Inside Tauri the shell hands the session over once;
// in a browser (development, Playwright) it comes from the URL: ?port=…&token=…, against
// a `lakelet serve` started with LAKELET_DEV_ORIGIN (A12).

export interface Session {
  port: number;
  token: string;
  pid: number;
  project: string;
}

export type SidecarEvent =
  | { kind: 'ready'; session: Session }
  | { kind: 'restarted'; session: Session }
  | { kind: 'down'; stderr: string };

export const inTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function getSession(): Promise<Session> {
  if (inTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<Session>('get_session');
  }
  const params = new URLSearchParams(window.location.search);
  const port = Number(params.get('port'));
  const token = params.get('token') ?? '';
  if (!port || !token) throw new Error('no session: open through the Lakelet app, or pass ?port=&token= from serve.json');
  return { port, token, pid: 0, project: params.get('project') ?? '' };
}

export async function onSidecarEvent(handler: (e: SidecarEvent) => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen<SidecarEvent>('sidecar', (e) => handler(e.payload));
}
