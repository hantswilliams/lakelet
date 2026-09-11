// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The window (app brief steps 0 to 2): the welcome screen when it has no project, else the
// project with its own sidecar: the status dot, what health says, the time the core took to
// be ready, screen 2 (SQL, the verdict, the streaming grid) once there is a table to ask,
// and screen 1 (tables, drop zone, preview, import).

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Api, type Health, type TableInfo } from './lib/api';
import {
  getSession, inTauri, onSidecarEvent, openProject, pickFolder, recentProjects, restartSidecar, windowProject,
  type RecentProject, type Session,
} from './lib/session';
import { OpenMenu } from './components/OpenMenu';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusDot, type Status } from './components/StatusDot';
// Screen 2 carries Arrow and CodeMirror; loaded once there is a table to ask, so the first
// paint (the launch budget, §3.2) does not wait for them.
const Query = lazy(() => import('./screens/Query').then((m) => ({ default: m.Query })));
import { Tables } from './screens/Tables';
import { Welcome } from './screens/Welcome';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)); // Tauri rejects with a string

const baseName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;

export default function App() {
  const [project, setProject] = useState<string | null>();
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [busy, setBusy] = useState<string>();
  const [openError, setOpenError] = useState<string>();
  const [status, setStatus] = useState<Status>('starting');
  const [detail, setDetail] = useState<string>();
  const [session, setSession] = useState<Session>();
  const [health, setHealth] = useState<Health>();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [error, setError] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const api = useMemo(() => (session ? new Api(session) : undefined), [session]);

  async function load(s: Session) {
    const api = new Api(s);
    const [h, t] = await Promise.all([api.health(), api.tables()]);
    setHealth(h);
    setTables(t);
    setStatus((prev) => (prev === 'restarted' ? prev : 'ready'));
  }

  const refreshTables = useCallback(async () => {
    if (session) setTables(await new Api(session).tables());
  }, [session]);

  // Which project this window has; asked again after opening one into this window.
  const refreshProject = useCallback(async () => {
    const [p, r] = await Promise.all([windowProject(), recentProjects()]);
    setRecent(r);
    setProject(p);
  }, []);

  useEffect(() => {
    refreshProject().catch((e: unknown) => { setProject(null); setOpenError(message(e)); });
  }, [refreshProject]);

  // With a project: the session (the shell waits for the sidecar), then health and tables.
  useEffect(() => {
    if (project == null) return;
    let cancelled = false;
    setStatus('starting');
    setError(undefined);
    getSession()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        return load(s);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus('down');
        setError(message(e));
      });
    const off = onSidecarEvent((e) => {
      if (e.kind === 'down') {
        // a sidecar killed from outside says nothing on stderr; the panel still needs a line
        const why = e.stderr.trim() || 'The core exited twice within a minute and printed nothing on its stderr.';
        setStatus('down');
        setDetail(why);
        setError(why);
      } else {
        if (e.kind === 'restarted') setStatus('restarted');
        setSession(e.session);
        load(e.session).catch((err: unknown) => setError(message(err)));
      }
    });
    return () => {
      cancelled = true;
      off.then((f) => f());
    };
  }, [project]);

  // A10: the dialog, then the shell opens the folder here (no project yet) or in a new window.
  async function open(path?: string) {
    setOpenError(undefined);
    try {
      const folder = path ?? (await pickFolder());
      if (!folder) return;
      setBusy(`opening ${baseName(folder)}…`);
      await openProject(folder);
      await refreshProject();
    } catch (e: unknown) {
      setOpenError(message(e));
    } finally {
      setBusy(undefined);
    }
  }

  // F0.8.6 and the settings key: ⌘/Ctrl+, opens settings, Esc closes it, ⌘/Ctrl+K goes to
  // the SQL box (the ask box's key, reserved for it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === ',') { e.preventDefault(); setSettingsOpen((o) => !o); }
      else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); (document.querySelector('.cm-content') as HTMLElement | null)?.focus(); }
      else if (e.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function restart() {
    setError(undefined);
    setStatus('starting');
    try {
      await restartSidecar();
      const s = await getSession();
      setSession(s);
      await load(s);
    } catch (e: unknown) {
      setStatus('down');
      setError(message(e));
    }
  }

  if (project === undefined) return <div className="app" />; // the first paint, before the shell answers

  return (
    <div className="app">
      <header className="bar">
        <span className="wordmark">lakelet</span>
        <span className="project" data-testid="project">{health?.project ?? (project ? baseName(project) : '')}</span>
        {project !== null && <StatusDot status={status} detail={detail} />}
        {inTauri() && project !== null && (
          <OpenMenu recent={recent} current={project} disabled={!!busy} onOpen={(p) => open(p)} onPick={() => open()} />
        )}
        {api && (
          <button type="button" className="quiet" onClick={() => setSettingsOpen((o) => !o)} aria-pressed={settingsOpen} title="Settings (⌘/Ctrl+,)" data-testid="settings-button">Settings</button>
        )}
      </header>
      <main>
        {project === null ? (
          <Welcome recent={recent} canPick={inTauri()} busy={busy} error={openError} onPick={() => open()} onOpen={(p) => open(p)} />
        ) : (
          <>
            {openError && <section className="error" data-testid="open-error"><b>That folder could not be opened.</b><pre>{openError}</pre></section>}
            {error && (
              <section className="error" data-testid="error">
                <b>{status === 'down' && session ? 'The core stopped.' : 'The core did not start.'}</b>
                <pre>{error}</pre>
                {inTauri() && <p><button type="button" className="primary" onClick={() => void restart()} data-testid="restart">Restart the core</button></p>}
                <p>
                  In development, export <code>LAKELET_SIDECAR</code> (the <code>lakelet</code> executable, for example <code>core/.venv/bin/lakelet</code>)
                  before <code>npm run tauri dev</code>; <code>LAKELET_PROJECT</code> names the folder to open.
                </p>
              </section>
            )}
            {settingsOpen && api && status !== 'down' && <SettingsPanel api={api} onClose={() => setSettingsOpen(false)} />}
            {settingsOpen && (!api || status === 'down') && (
              <section className="settings" data-testid="settings"><header><h2>Settings</h2><button type="button" className="quiet" onClick={() => setSettingsOpen(false)}>Close (Esc)</button></header><p className="muted">The core is not running; settings are read and written through it. Restart it first.</p></section>
            )}
            {session?.initialised && (
              <section className="notice" data-testid="initialised">
                <b>Set up {baseName(session.project)} as a lakehouse.</b>
                <pre>{session.initialised}</pre>
              </section>
            )}
            {health && (
              <section className="health" data-testid="health">
                <div><b>{health.lakelet}</b><span>lakelet</span></div>
                <div><b>{health.duckdb}</b><span>DuckDB</span></div>
                <div><b>{health.machine.memory_limit_text ?? '—'}</b><span>memory limit, this window</span></div>
                <div title={health.throughput_probe === 'cached' ? 'Measured through the page cache and capped; run `lakelet gauge probe` in the project to measure the disk.' : undefined}>
                  <b>{health.throughput_local_mbps ? `${Math.round(health.throughput_local_mbps).toLocaleString()} MB/s` : '—'}</b>
                  <span>{health.throughput_probe === 'cached' ? 'local disk (cached; run lakelet gauge probe)' : 'local disk'}</span>
                </div>
                <div data-testid="ready-ms"><b>{session?.ready_ms ? `${session.ready_ms} ms` : '—'}</b><span>core ready in</span></div>
              </section>
            )}
            {session && status !== 'down' && tables.length > 0 && (
              <Suspense fallback={<section className="query" data-testid="query-loading" />}><Query session={session} tables={tables} /></Suspense>
            )}
            {session && status !== 'down' && <Tables session={session} tables={tables} aws={health?.aws} onChanged={refreshTables} />}
          </>
        )}
      </main>
    </div>
  );
}
