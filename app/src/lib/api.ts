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
  /** How the disk figure was measured: cache bypassed (`nocache`, `direct`), or `cached` and capped. */
  throughput_probe?: 'nocache' | 'direct' | 'cached' | 'none';
  bandwidth_mbps: number | null;
  /** Whether the core has AWS credentials, and from where (never a key). */
  aws?: { configured: boolean; source: 'environment' | 'profile' | 'none'; profile: string | null; region: string; endpoint: string | null };
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
  /** The prefix an attached table was registered from; null for a table Lakelet wrote. */
  source?: string | null;
  /** Read without credentials (a public bucket). */
  public?: boolean;
  /** `table`, or `view` for a catalog view (real-data R6), whose rows and bytes are 0. */
  kind?: 'table' | 'view';
  view_sql?: string | null;
}

export interface Snapshot {
  id: number;
  timestamp: string;
  operation: string | null;
  added_rows: number | null;
  added_bytes: number | null;
  added_files: number | null;
  deleted_rows: number | null;
  total_rows: number | null;
  current: boolean;
  expirable: boolean;
}

/** `lakelet tables describe`: the list's fields plus partitioning, the snapshots, and what `expire` would take. */
export interface TableDescription extends TableInfo {
  partitioning: string;
  expirable_snapshots: number;
  reclaimable_bytes: number;
  keep_days: number;
  last_commit: { snapshot_id?: number; operation?: string | null; timestamp?: string };
  snapshots: number;
  format_version: number;
  snapshot_list: Snapshot[];
  /** A view's properties (`lakelet.dbt-model` names the dbt model it came from); empty for a table. */
  properties?: Record<string, string>;
}

export interface ExpireReport {
  name: string;
  keep_days: number;
  snapshots_before: number;
  snapshots_removed: number;
  files_removed: number;
  bytes_reclaimed: number;
}

/** A recorded run (`/api/history`), the fields the Gauge screen reads. */
export interface HistoryRun {
  id: number;
  ts: string;
  verdict: string | null;
  ran: boolean;
  ran_where: string;
  est_bytes: number | null;
  est_wall_local: number | null;
  actual_wall: number | null;
  actual_bytes: number | null;
  error: string | null;
  sql_text: string;
}

export interface GaugeSummary {
  runs: number;
  compared: number;
  within_2x: number;
  within_2x_share: number | null;
  green_over_3min: number;
}

/** A test on a dbt model from `schema.yml` (Simple mode calls it a check). */
export interface ModelTest {
  name: string;
  /** `not_null`, `unique`, `accepted_values`, `relationships`, a project's own, or `singular` (a SQL file under `tests/`). */
  kind: string;
  column: string | null;
  unique_id: string;
}

/** A model's last `lakelet run`, from history. */
export interface LastRun {
  ts: string;
  ok: boolean;
  seconds: number | null;
  verdict: string | null;
  error: string | null;
}

/** One model of `lakelet run --plan` (`GET /api/run/plan`): compiled, estimated, in dependency order. */
export interface PlannedModel {
  name: string;
  unique_id: string;
  materialized: string;
  depends_on: string[];
  compiled_sql: string;
  verdict: string | null;
  words: string | null;
  reason: string | null;
  est_wall_local: number | null;
  est_bytes: number | null;
  /** The gauge could not estimate it (the run will say). */
  error: string | null;
  description: string;
  path: string;
  tests: ModelTest[];
  last_run: LastRun | null;
}

export interface ModelResult {
  name: string;
  status: string;
  seconds: number;
  message: string | null;
}

/** `POST /api/run`: what `lakelet run` did. */
export interface RunReport {
  models: PlannedModel[];
  results: ModelResult[];
  views_recorded: string[];
  views_dropped: string[];
  seconds: number;
  ok: boolean;
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
  /** A remote prefix's preview (`tables attach`, not `import`): what would be registered in place. */
  remote?: boolean;
  files?: number | null;
  bytes?: number | null;
  anonymous?: boolean;
}

export type ImportMode = 'create' | 'replace' | 'append';

export type SettingKey = 'engine.memory_limit' | 'engine.threads' | 'gauge.share_calibration' | 'catalog.keep_snapshots_days';

export interface Settings {
  settings: Record<SettingKey, string | number | boolean>;
  path: string;
  note: string;
}

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

  /** A file's preview, or a folder's: one per file `import` would take (A9); an `s3://`
   *  prefix's: the columns of one footer and the files it would register (real-data R4). */
  async preview(path: string, name?: string, anonymous = false): Promise<Preview[]> {
    const body: Record<string, unknown> = { path };
    if (name) body.name = name;
    if (anonymous) body.anonymous = true;
    const p = await this.post<Preview | Preview[]>('/preview', body);
    return Array.isArray(p) ? p : [p];
  }

  /** `lakelet tables attach <name> [--anonymous] <prefix>`: registered in place, nothing copied. */
  attach(name: string, source: string, anonymous = false): Promise<TableInfo> {
    return this.post<TableInfo>('/tables/attach', { name, source, anonymous });
  }

  history(last = 200): Promise<HistoryRun[]> {
    return this.get<HistoryRun[]>(`/history?last=${last}`);
  }

  gaugeSummary(): Promise<GaugeSummary> {
    return this.get<GaugeSummary>('/gauge/summary');
  }

  /** `lakelet gauge export`: written into the project, nothing sent. */
  gaugeExport(): Promise<{ path: string; runs: number }> {
    return this.post('/gauge/export', {});
  }

  /** `lakelet gauge reset --yes`. */
  gaugeReset(): Promise<{ removed: number }> {
    return this.post('/gauge/reset', {});
  }

  /** `lakelet gauge probe`: measure the disk again. */
  gaugeProbe(): Promise<{ mbps: number; method: string; size_bytes: number }> {
    return this.post('/gauge/probe', {});
  }

  describe(name: string): Promise<TableDescription> {
    return this.get<TableDescription>(`/tables/${encodeURIComponent(name)}`);
  }

  /** `lakelet tables sample <name> -n 5`: the first rows, as objects keyed by column. */
  sample(name: string, n = 5): Promise<Record<string, unknown>[]> {
    return this.get<Record<string, unknown>[]>(`/tables/${encodeURIComponent(name)}/sample?n=${n}&truncate=80`);
  }

  /** `lakelet tables expire <name>`: snapshots past the retention and the files only they used. */
  expire(name: string): Promise<ExpireReport> {
    return this.post<ExpireReport>(`/tables/${encodeURIComponent(name)}/expire`, {});
  }

  /** `lakelet tables refresh <name>`: the files new under the prefix since the attach. */
  refresh(name: string): Promise<{ name: string; added: number; files: number; rows: number }> {
    return this.post(`/tables/${encodeURIComponent(name)}/refresh`, {});
  }

  /** `lakelet run --plan [select]...`: the DAG through the gauge, nothing built. */
  runPlan(select: string[] = []): Promise<PlannedModel[]> {
    return this.get<PlannedModel[]>(select.length ? `/run/plan?select=${encodeURIComponent(select.join(','))}` : '/run/plan');
  }

  /** `lakelet run [select]... [--run-anyway]`: build the DAG here; a Red model refuses
   *  (409 `red_refused`) until `run_anyway`. */
  run(select: string[] = [], runAnyway = false): Promise<RunReport> {
    return this.post<RunReport>('/run', { select, burst: 'never', run_anyway: runAnyway });
  }

  settings(): Promise<Settings> {
    return this.get<Settings>('/settings');
  }

  /** `lakelet config set <key> <value>`: one line of lakelet.toml rewritten in place. */
  async setSetting(key: SettingKey, value: string): Promise<Settings> {
    const r = await fetch(`${this.base}/settings`, {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ key, value }),
    });
    return this.answer<Settings>(r, '/settings');
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
