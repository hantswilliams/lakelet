// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Step 0 of the app brief: one window, the status dot, and what health says. Screens 1 and
// 2 replace the body in steps 2 and 3.

import { useEffect, useState } from 'react';
import { Api, humanBytes, type Health, type TableInfo } from './lib/api';
import { getSession, onSidecarEvent, type Session } from './lib/session';
import { StatusDot, type Status } from './components/StatusDot';

export default function App() {
  const [status, setStatus] = useState<Status>('starting');
  const [detail, setDetail] = useState<string>();
  const [session, setSession] = useState<Session>();
  const [health, setHealth] = useState<Health>();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [error, setError] = useState<string>();

  async function load(s: Session) {
    const api = new Api(s);
    const [h, t] = await Promise.all([api.health(), api.tables()]);
    setHealth(h);
    setTables(t);
    setStatus((prev) => (prev === 'restarted' ? prev : 'ready'));
  }

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        return load(s);
      })
      .catch((e: unknown) => {
        // Tauri rejects a failed command with a string, not an Error
        setStatus('down');
        setError(e instanceof Error ? e.message : String(e));
      });
    const off = onSidecarEvent((e) => {
      if (e.kind === 'down') {
        setStatus('down');
        setDetail(e.stderr);
      } else {
        if (e.kind === 'restarted') setStatus('restarted');
        setSession(e.session);
        load(e.session).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
      }
    });
    return () => {
      cancelled = true;
      off.then((f) => f());
    };
  }, []);

  return (
    <div className="app">
      <header className="bar">
        <span className="wordmark">lakelet</span>
        <span className="project" data-testid="project">{health?.project ?? session?.project ?? ''}</span>
        <StatusDot status={status} detail={detail} />
      </header>
      <main>
        {error && (
          <section className="error" data-testid="error">
            <b>The core did not start.</b>
            <pre>{error}</pre>
            <p>In development, export <code>LAKELET_SIDECAR</code> (the <code>lakelet</code> executable, for example <code>core/.venv/bin/lakelet</code>) and <code>LAKELET_PROJECT</code> (a folder with a <code>lakelet.toml</code>, or one to <code>lakelet init</code>) before <code>npm run tauri dev</code>.</p>
          </section>
        )}
        {health && (
          <section className="health" data-testid="health">
            <div><b>{health.lakelet}</b><span>lakelet</span></div>
            <div><b>{health.duckdb}</b><span>DuckDB</span></div>
            <div><b>{health.machine.memory_limit_text ?? '—'}</b><span>memory limit</span></div>
            <div><b>{health.throughput_local_mbps ? `${Math.round(health.throughput_local_mbps)} MB/s` : '—'}</b><span>local disk</span></div>
          </section>
        )}
        <section className="tables" data-testid="tables">
          <h2>Tables</h2>
          {tables.length === 0 ? (
            <p className="muted">No tables yet. Drop a CSV, Parquet, Excel or JSON file here, or run <code>lakelet import &lt;file&gt;</code>.</p>
          ) : (
            <table>
              <thead><tr><th>Table</th><th>Rows</th><th>Size</th><th>Columns</th></tr></thead>
              <tbody>
                {tables.map((t) => (
                  <tr key={t.name}>
                    <td className="mono">{t.name}</td>
                    <td>{t.rows.toLocaleString()}</td>
                    <td>{humanBytes(t.bytes)}</td>
                    <td>{t.columns.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
