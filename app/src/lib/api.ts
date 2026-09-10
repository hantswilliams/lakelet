// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The core's /api (docs: the local HTTP API), called directly from the webview.

import type { Session } from './session';

export interface Health {
  lakelet: string;
  duckdb: string;
  project: string;
  root: string;
  machine: { ram?: number; threads?: number; memory_limit?: number; memory_limit_text?: string };
  throughput_local_mbps: number | null;
  bandwidth_mbps: number | null;
}

export interface TableInfo {
  name: string;
  rows: number;
  bytes: number;
  columns: [string, string][];
  location: string;
  snapshot_id: number | null;
  /** When the current snapshot was committed, ISO 8601. */
  freshness: string | null;
}

export interface PreviewColumn {
  name: string;
  duckdb_type: string;
  iceberg_type: string;
  note: string;
}

export interface Preview {
  name: string;
  source: string;
  columns: PreviewColumn[];
  sample: unknown[][];
}

export type ImportMode = 'create' | 'replace' | 'append';

/** An error the core answered with: `{error, message}` and the HTTP status. */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export class Api {
  constructor(private readonly session: Session) {}

  get base(): string {
    return `http://127.0.0.1:${this.session.port}/api`;
  }

  get token(): string {
    return this.session.token;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.session.token}`, ...extra };
  }

  private async answer<T>(r: Response, path: string): Promise<T> {
    if (r.ok) return (await r.json()) as T;
    const text = await r.text();
    try {
      const body = JSON.parse(text) as { error?: string; message?: string };
      if (body.error) throw new ApiError(r.status, body.error, body.message ?? body.error);
    } catch (e) {
      if (e instanceof ApiError) throw e;
    }
    throw new ApiError(r.status, 'http', `${path}: ${r.status} ${text}`);
  }

  async get<T>(path: string): Promise<T> {
    return this.answer<T>(await fetch(`${this.base}${path}`, { headers: this.headers() }), path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return this.answer<T>(r, path);
  }

  health(): Promise<Health> {
    return this.get<Health>('/health');
  }

  tables(): Promise<TableInfo[]> {
    return this.get<TableInfo[]>('/tables');
  }

  /** A file's preview, or a folder's: one per file `import` would take (A9). */
  async preview(path: string, name?: string): Promise<Preview[]> {
    const p = await this.post<Preview | Preview[]>('/preview', name ? { path, name } : { path });
    return Array.isArray(p) ? p : [p];
  }

  import(path: string, mode: ImportMode, name?: string): Promise<TableInfo[]> {
    return this.post<TableInfo[]>('/import', name ? { path, name, mode } : { path, mode });
  }
}

export const humanBytes = (n: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return i < 2 ? `${Math.round(n)} ${units[i]}` : `${n.toFixed(1)} ${units[i]}`;
};

/** "just now", "4 min ago", "3 h ago", "2 d ago", or the date: freshness the way a panel says it. */
export const ago = (iso: string | null, now = Date.now()): string => {
  if (!iso) return '—';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return iso.slice(0, 10);
};
