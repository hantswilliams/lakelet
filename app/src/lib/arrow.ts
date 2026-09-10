// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The query path (app brief §3.3): POST /api/query, the verdict from the headers before any
// row, then Arrow record batches as the core produces them, each handed to the caller as it
// lands. Esc aborts the fetch, which closes the response and the core's result.

import { RecordBatchReader, type RecordBatch } from 'apache-arrow';
import { ApiError, type Api } from './api';

export type Verdict = 'green' | 'yellow' | 'red';

export interface VerdictLine {
  verdict: Verdict;
  words: string;
  reason: string;
}

/** The estimate as `/api/estimate` and a 409 `red_refused` carry it. */
export interface Estimate extends VerdictLine {
  line: string;
  bytes_scanned: number;
  peak_memory: number;
  wall_local: number;
  wall_burst: number;
  cost_burst: number;
  cap: number;
  memory_limit?: number;
}

export class RedRefused extends Error {
  constructor(public readonly estimate: Estimate) {
    super(estimate.reason);
  }
}

export interface Column {
  name: string;
  type: string;
}

export type Row = unknown[];

export interface QueryEvents {
  /** The headers arrived: the verdict, before any row. */
  onVerdict: (v: VerdictLine) => void;
  /** The first batch names the columns. */
  onSchema: (columns: Column[]) => void;
  /** Rows of one batch, as it arrived. Return false to stop reading (the cap, A4). */
  onRows: (rows: Row[]) => boolean | void;
}

/** A cell as the grid shows it: BigInt and Arrow's wrappers become plain values. */
export function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v !== null && 'toJSON' in v && typeof (v as { toJSON: unknown }).toJSON === 'function') {
    return (v as { toJSON: () => unknown }).toJSON();
  }
  return v;
}

function rowsOf(batch: RecordBatch): Row[] {
  const n = batch.numRows;
  const columns = batch.schema.fields.map((_, i) => batch.getChildAt(i)!);
  const rows: Row[] = new Array(n);
  for (let r = 0; r < n; r++) {
    const row: Row = new Array(columns.length);
    for (let c = 0; c < columns.length; c++) row[c] = plain(columns[c].get(r));
    rows[r] = row;
  }
  return rows;
}

const header = (r: Response, name: string) => r.headers.get(name) ?? '';

/**
 * Run SQL and stream its rows. Resolves when the stream ends or the caller stopped it;
 * rejects with RedRefused (409), ApiError (any other core error) or the abort's DOMException.
 */
export async function runQuery(api: Api, sql: string, allowRed: boolean, signal: AbortSignal, events: QueryEvents): Promise<{ rows: number; complete: boolean }> {
  const r = await fetch(`${api.base}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.apache.arrow.stream' },
    body: JSON.stringify({ sql, allow_red: allowRed, batch_rows: 1000 }),
    signal,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string; estimate?: Estimate };
    if (r.status === 409 && body.error === 'red_refused' && body.estimate) throw new RedRefused(body.estimate);
    throw new ApiError(r.status, body.error ?? 'http', body.message ?? `${r.status}`);
  }
  events.onVerdict({
    verdict: (header(r, 'X-Lakelet-Verdict') || 'green') as Verdict,
    words: header(r, 'X-Lakelet-Words'),
    reason: header(r, 'X-Lakelet-Reason'),
  });
  if (!r.body) throw new Error('no response body');
  const reader = await RecordBatchReader.from(r.body);
  let rows = 0;
  let named = false;
  try {
    for await (const batch of reader) {
      if (!named) {
        events.onSchema(batch.schema.fields.map((f) => ({ name: f.name, type: String(f.type) })));
        named = true;
      }
      rows += batch.numRows;
      if (events.onRows(rowsOf(batch)) === false) {
        await reader.cancel();
        return { rows, complete: false };
      }
    }
    if (!named) events.onSchema(reader.schema?.fields.map((f) => ({ name: f.name, type: String(f.type) })) ?? []);
  } finally {
    // an abort closes the body; nothing else to release
  }
  return { rows, complete: true };
}

/** `lakelet estimate`: the gauge without running. */
export async function estimate(api: Api, sql: string): Promise<Estimate> {
  return api.post<Estimate>('/estimate', { sql });
}
