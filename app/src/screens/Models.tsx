// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Screens 7 and 8 of the mockups (real-data brief R5, step 6): the project's dbt models
// through the gauge. Technical mode is `lakelet run --plan` as a panel: the DAG with a
// verdict per model, and a model's compiled SQL, refs, tests, and last run; `Run all` is
// `lakelet run`, `Run this` is `lakelet run <model>`, a Red model refuses until
// `Run anyway`. Simple mode is the same DAG as cards: questions, checks, freshness, and
// one `Refresh all`. Nothing here does what the terminal cannot.

import { useCallback, useEffect, useState } from 'react';
import { Api, ApiError, ago, humanBytes, type ModelResult, type PlannedModel, type RunReport, type TableInfo } from '../lib/api';
import { runCommand } from '../lib/command';
import type { Session } from '../lib/session';
import { humanSeconds, planSummary, testLabel, verdictSentence, words, type Mode } from '../lib/vocabulary';
import { Command } from '../components/Command';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const verdictWord: Record<string, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' };

export interface ModelsProps {
  session: Session;
  mode: Mode;
  /** The tables panel's list: a model's freshness is its table's or its view's. */
  tables: TableInfo[];
  /** After a run: tables and views changed. */
  onChanged: () => Promise<void>;
}

function Verdict({ m }: { m: PlannedModel }) {
  if (m.error) return <span className="verdict none" data-testid="verdict">?</span>;
  return <span className={`verdict ${m.verdict ?? 'none'}`} data-testid="verdict">{m.verdict ? verdictWord[m.verdict] ?? m.verdict : '—'}</span>;
}

function LastRunLine({ m, label }: { m: PlannedModel; label: string }) {
  const r = m.last_run;
  if (!r) return <span className="muted">{label}: never</span>;
  return (
    <span className="muted" data-testid="last-run">
      {label}: {ago(r.ts)}{r.ok ? (r.seconds !== null ? `, took ${humanSeconds(r.seconds)}` : '') : `, failed${r.error ? ` (${r.error})` : ''}`}
    </span>
  );
}

function Refs({ m, byId }: { m: PlannedModel; byId: Map<string, PlannedModel> }) {
  if (m.depends_on.length === 0) return <span className="muted">none: reads tables directly</span>;
  return (
    <span className="mono">
      {m.depends_on.map((d) => byId.get(d)?.name ?? d.split('.').pop() ?? d).join(', ')}
    </span>
  );
}

export function Models({ session, mode, tables, onChanged }: ModelsProps) {
  const api = new Api(session);
  const w = words(mode);
  const [models, setModels] = useState<PlannedModel[]>();
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [refusal, setRefusal] = useState<{ text: string; select: string[] }>();
  const [report, setReport] = useState<RunReport>();

  const load = useCallback(async () => {
    setBusy(w.planning);
    try {
      const planned = await api.runPlan();
      setModels(planned);
      setError(undefined);
      setSelected((s) => (s && planned.some((m) => m.name === s) ? s : planned[0]?.name));
    } catch (e: unknown) {
      setModels([]);
      setError(message(e));
    } finally {
      setBusy(undefined);
    }
  }, [session.port, session.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  async function run(select: string[], runAnyway = false) {
    setBusy(w.running);
    setError(undefined);
    setRefusal(undefined);
    try {
      const r = await api.run(select, runAnyway);
      setReport(r);
      await onChanged();
      await load();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'red_refused') setRefusal({ text: e.message, select });
      else setError(message(e));
      setBusy(undefined);
    }
  }

  const byId = new Map((models ?? []).map((m) => [m.unique_id, m]));
  const byName = new Map(tables.map((t) => [t.name, t]));
  const results = new Map<string, ModelResult>((report?.results ?? []).map((r) => [r.name, r]));
  const current = models?.find((m) => m.name === selected);
  const anyRed = (models ?? []).some((m) => m.verdict === 'red');

  const runAll = (
    <button type="button" className="primary" disabled={!!busy || !models?.length} data-testid="run-all" onClick={() => void run([])}>
      {busy ?? w.runAll}
    </button>
  );

  const reportLine = report && (
    <section className="notice" data-testid="run-report">
      <b>
        {report.ok
          ? `${report.results.length} ${report.results.length === 1 ? w.model : w.models} built in ${humanSeconds(report.seconds)}.`
          : `${report.results.filter((r) => r.status !== 'success').length} of ${report.results.length} failed.`}
        {report.views_recorded.length > 0 && ` ${mode === 'simple' ? 'Answered live' : 'Views in the catalog'}: ${report.views_recorded.join(', ')}.`}
        {report.views_dropped.length > 0 && ` Dropped: ${report.views_dropped.join(', ')}.`}
      </b>
      {report.results.filter((r) => r.status !== 'success').map((r) => (
        <pre key={r.name} data-testid={`failed-${r.name}`}>{r.name}: {r.message ?? r.status}</pre>
      ))}
    </section>
  );

  const refusalBox = refusal && (
    <section className="error" data-testid="refusal">
      <b>{mode === 'simple' ? 'Too big for this machine right now.' : 'The gauge refused the run.'}</b>
      <pre>{refusal.text}</pre>
      <div className="actions">
        <button type="button" className="quiet" disabled={!!busy} data-testid="run-anyway" onClick={() => void run(refusal.select, true)}>{w.runAnyway}</button>
        <Command line={runCommand(refusal.select, { runAnyway: true })} />
      </div>
    </section>
  );

  const empty = models && models.length === 0 && !error && (
    <p className="muted" data-testid="no-models">
      {mode === 'simple'
        ? 'No questions saved yet. A question is a SQL file under models/; ask one on the Tables screen and save it there.'
        : 'No models. A model is a SQL file under models/ (dbt); lakelet run builds them through the gauge.'}
    </p>
  );

  if (mode === 'simple') {
    return (
      <section className="models-screen simple" data-testid="models-screen" data-mode="simple">
        <header>
          <h2>{w.screen}<span className="muted"> · {models ? planSummary(models, mode) : '…'}</span></h2>
          <span className="run-all">{runAll}<Command line={runCommand()} /></span>
        </header>
        {reportLine}
        {refusalBox}
        {error && <section className="error" data-testid="models-error"><pre>{error}</pre></section>}
        {empty}
        <div className="cards" data-testid="cards">
          {(models ?? []).map((m) => {
            const t = byName.get(m.name);
            const r = results.get(m.name);
            return (
              <article key={m.unique_id} className={`card ${m.verdict ?? ''}`} data-testid={`card-${m.name}`}>
                <h3 className="mono">{m.name}</h3>
                <p className="kind">{m.materialized === 'view' ? w.view : w.table}{t?.freshness ? ` · ${w.lastRun.toLowerCase()} ${ago(t.freshness)}` : ''}</p>
                {m.description && <p className="description">{m.description}</p>}
                <p className="sentence" data-testid="sentence">{verdictSentence(m, mode)}</p>
                <p className="checks" data-testid="checks">
                  {m.tests.length === 0 ? `no ${w.tests}` : `${m.tests.length} ${m.tests.length === 1 ? w.test : w.tests}: ${m.tests.map((x) => testLabel(x, mode)).join('; ')}`}
                </p>
                {r && <p className={r.status === 'success' ? 'muted' : 'failed'}>{r.status === 'success' ? `refreshed just now in ${humanSeconds(r.seconds)}` : `failed: ${r.message ?? r.status}`}</p>}
                <footer>
                  <button type="button" className="quiet" disabled={!!busy} data-testid={`refresh-${m.name}`} onClick={() => void run([m.name])}>{w.runOne}</button>
                  <Command line={runCommand([m.name])} />
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="models-screen" data-testid="models-screen" data-mode="technical">
      <header>
        <h2>{w.screen}<span className="muted"> · {models ? planSummary(models, mode) : '…'}</span></h2>
        <span className="run-all">{runAll}<Command line={runCommand()} /></span>
      </header>
      {reportLine}
      {refusalBox}
      {error && (
        <section className="error" data-testid="models-error">
          <b>The plan failed.</b>
          <pre>{error}</pre>
          <p>The plan is <code>lakelet run --plan</code>: dbt compiles the project, then every model is estimated. dbt comes with <code>pip install 'lakelet[dbt]'</code>.</p>
        </section>
      )}
      {empty}
      {models && models.length > 0 && (
        <div className="split">
          <table className="dag" data-testid="dag">
            <thead><tr><th>Model</th><th>Kind</th><th>Verdict</th><th>Estimate</th><th>Scans</th><th>Last run</th></tr></thead>
            <tbody>
              {models.map((m) => {
                const r = results.get(m.name);
                return (
                  <tr key={m.unique_id} className={m.name === selected ? 'on' : ''} data-testid={`model-${m.name}`} onClick={() => setSelected(m.name)}>
                    <td className="mono">{m.name}</td>
                    <td>{m.materialized}</td>
                    <td><Verdict m={m} /></td>
                    <td>{m.est_wall_local === null ? '—' : humanSeconds(m.est_wall_local)}</td>
                    <td>{m.est_bytes === null ? '—' : humanBytes(m.est_bytes)}</td>
                    <td className={r && r.status !== 'success' ? 'failed' : 'muted'}>
                      {r ? (r.status === 'success' ? `just now, ${humanSeconds(r.seconds)}` : `failed`) : m.last_run ? ago(m.last_run.ts) : 'never'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {current && (
            <article className="model" data-testid="model-detail">
              <header>
                <h3 className="mono">{current.name}<span className="muted"> · {current.materialized} · {current.path}</span></h3>
              </header>
              {current.description && <p>{current.description}</p>}
              <dl className="facts">
                <dt>Verdict</dt>
                <dd><Verdict m={current} /> <span data-testid="sentence">{verdictSentence(current, mode)}</span>{current.reason && !current.error ? <span className="muted"> · {current.reason}</span> : null}</dd>
                <dt>Refs</dt>
                <dd data-testid="refs"><Refs m={current} byId={byId} /></dd>
                <dt>Tests</dt>
                <dd data-testid="tests">
                  {current.tests.length === 0 ? <span className="muted">none in schema.yml</span> : (
                    <ul>{current.tests.map((t) => <li key={t.unique_id} className="mono">{testLabel(t, mode)}</li>)}</ul>
                  )}
                </dd>
                <dt>{w.lastRun}</dt>
                <dd><LastRunLine m={current} label="run" /></dd>
              </dl>
              <h4>Compiled SQL</h4>
              <pre className="sql" data-testid="compiled-sql">{current.compiled_sql}</pre>
              <footer className="actions">
                <button type="button" className={current.verdict === 'red' ? 'quiet' : 'primary'} disabled={!!busy} data-testid="run-this" onClick={() => void run([current.name])}>{w.runOne}</button>
                <Command line={runCommand([current.name])} />
                {current.verdict === 'red' && <span className="muted">Red: the run refuses this one until {w.runAnyway.toLowerCase()}.</span>}
              </footer>
            </article>
          )}
        </div>
      )}
      {anyRed && !refusal && models && <p className="muted" data-testid="red-note">A Red model makes <code>lakelet run</code> refuse the whole DAG until <code>--run-anyway</code>; that is the gauge's promise, not a limit of the app.</p>}
    </section>
  );
}
