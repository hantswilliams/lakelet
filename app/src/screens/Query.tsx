// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Screen 2 of the app brief: SQL in, the verdict before the rows, the rows as they stream.
// Cmd/Ctrl+Enter runs; Esc aborts the fetch, which closes the core's result and records the
// run as stopped early; Red is a refusal until "Run anyway"; the grid keeps 100,000 rows.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Api, ApiError, type TableInfo } from '../lib/api';
import { RedRefused, runQuery, type Column, type Row, type VerdictLine } from '../lib/arrow';
import { sqlCommand } from '../lib/command';
import type { Session } from '../lib/session';
import { Command } from '../components/Command';
import { GaugeLine, type RunState } from '../components/GaugeLine';
import { Chart } from '../components/Chart';
import { Grid } from '../components/Grid';
import { SqlEditor } from '../components/SqlEditor';

export const ROW_CAP = 100_000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Query({ session, tables }: { session: Session; tables: TableInfo[] }) {
  const [sql, setSql] = useState('');
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [allowRed, setAllowRed] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  // Milliseconds from Run: when the verdict arrived, when the first rows reached the grid
  // and how many, when the run ended; the step 3 gate reads them (§3.3's promise, measured).
  const [timing, setTiming] = useState<{ verdict?: number; firstRows?: number; firstCount?: number; done?: number }>({});
  const pending = useRef<Row[]>([]);
  const frame = useRef<number | undefined>(undefined);

  const schema = Object.fromEntries(tables.map((t) => [t.name, t.columns.map(([name]) => name)]));

  // Batches land faster than React should paint; they are flushed once per frame.
  const flush = useCallback(() => {
    frame.current = undefined;
    if (pending.current.length === 0) return;
    const add = pending.current;
    pending.current = [];
    setRows((prev) => (prev.length === 0 ? add : prev.concat(add)));
  }, []);

  const run = useCallback(async (text: string, red: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    pending.current = [];
    setRows([]);
    setColumns([]);
    setState({ kind: 'estimating' });
    const api = new Api(session);
    const t0 = performance.now();
    let verdict: VerdictLine | undefined;
    let count = 0;
    let capped = false;
    let first = true;
    setTiming({});
    try {
      const result = await runQuery(api, trimmed, red, ac.signal, {
        onVerdict: (v) => { verdict = v; setTiming((t) => ({ ...t, verdict: performance.now() - t0 })); setState({ kind: 'running', verdict: v, rows: 0 }); },
        onSchema: (cols) => setColumns(cols),
        onRows: (batch) => {
          const room = ROW_CAP - count;
          const take = batch.length > room ? batch.slice(0, room) : batch;
          count += take.length;
          pending.current.push(...take);
          if (first) { first = false; flush(); setTiming((t) => ({ ...t, firstRows: performance.now() - t0, firstCount: count })); }
          else if (frame.current === undefined) frame.current = requestAnimationFrame(flush);
          setState({ kind: 'running', verdict: verdict!, rows: count });
          if (count >= ROW_CAP) { capped = true; return false; }
          return true;
        },
      });
      flush();
      setTiming((t) => ({ ...t, done: performance.now() - t0 }));
      setState({ kind: 'done', verdict: verdict!, rows: count, seconds: (performance.now() - t0) / 1000, complete: result.complete && !capped, capped });
    } catch (e: unknown) {
      flush();
      if (ac.signal.aborted) {
        setState({ kind: 'stopped', verdict, rows: count, seconds: (performance.now() - t0) / 1000 });
      } else if (e instanceof RedRefused) {
        setState({ kind: 'refused', verdict: e.estimate });
      } else if (e instanceof ApiError) {
        setState({ kind: 'error', message: `${e.code}: ${e.message}` });
      } else {
        setState({ kind: 'error', message: message(e) });
      }
    } finally {
      if (controller.current === ac) controller.current = undefined;
    }
  }, [session, flush]);

  const cancel = useCallback(() => { controller.current?.abort(); }, []);

  useEffect(() => () => controller.current?.abort(), []);

  // F0.8.6: Esc cancels from anywhere in the window, not only inside the box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && controller.current) { controller.current.abort(); e.preventDefault(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const running = state.kind === 'running' || state.kind === 'estimating';

  return (
    <section className="query" data-testid="query" data-verdict-ms={timing.verdict?.toFixed(0)} data-first-rows-ms={timing.firstRows?.toFixed(0)} data-first-rows={timing.firstCount} data-done-ms={timing.done?.toFixed(0)}>
      <SqlEditor value={sql} onChange={(s) => { setSql(s); setAllowRed(false); }} onRun={() => void run(sql, allowRed)} onCancel={cancel} schema={schema} autoFocus />
      <div className="query-bar">
        {running ? (
          <button type="button" className="quiet" onClick={cancel} data-testid="cancel">Stop (Esc)</button>
        ) : (
          <button type="button" className="primary" onClick={() => void run(sql, allowRed)} disabled={!sql.trim()} data-testid="run">Run</button>
        )}
        <Command line={sql.trim() ? sqlCommand(sql.trim(), allowRed) : 'lakelet sql <sql>'} />
      </div>
      <GaugeLine state={state} onRunAnyway={() => { setAllowRed(true); void run(sql, true); }} />
      <Chart columns={columns} rows={rows} done={state.kind === 'done'} />
      <Grid columns={columns} rows={rows} />
    </section>
  );
}
