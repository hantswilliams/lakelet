// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// A table's detail (real-data brief R7): `describe` as a panel, with the columns, where the
// data is, partitioning, the snapshot list, what `expire` would reclaim at the project's
// retention, and three buttons that are three CLI verbs: sample, expire, refresh. A view
// (real-data R6, step 6) has its own shape: its query, its columns, its version, the dbt
// model it came from and that `lakelet run` rebuilds it; no snapshots, nothing to expire.

import { ago, humanBytes, type TableDescription } from '../lib/api';
import { describeCommand, expireCommand, refreshCommand, runCommand, sampleCommand } from '../lib/command';
import { words, type Mode } from '../lib/vocabulary';
import { Command } from './Command';

export interface TableDetailProps {
  table: TableDescription;
  sample?: Record<string, unknown>[];
  /** Screen 8: a view's words. Technical by default. */
  mode?: Mode;
  busy?: string;
  error?: string;
  onSample: () => void;
  onExpire: () => void;
  onRefresh: () => void;
  onClose: () => void;
}

const cell = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function Where({ t }: { t: TableDescription }) {
  if (!t.source) return <span>local, under the project's warehouse</span>;
  return <span>{t.public ? 'public bucket, read without credentials' : 'attached'}: <span className="mono">{t.source}</span></span>;
}

const DBT_MODEL = 'lakelet.dbt-model';

function SampleBlock({ t, sample }: { t: TableDescription; sample: Record<string, unknown>[] }) {
  return (
    <div data-testid="sample">
      <h3>First rows</h3>
      {sample.length === 0 ? <p className="muted">{t.kind === 'view' ? 'The view answers no rows right now.' : 'The table is empty.'}</p> : (
        <table className="sample">
          <thead><tr>{Object.keys(sample[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>
            {sample.map((row, i) => <tr key={i}>{Object.values(row).map((v, j) => <td key={j} className="mono">{cell(v)}</td>)}</tr>)}
          </tbody>
        </table>
      )}
      <Command line={sampleCommand(t.name)} />
    </div>
  );
}

function ViewDetail({ table: t, sample, mode, busy, error, onSample, onClose }: TableDetailProps & { mode: Mode }) {
  const w = words(mode);
  const modelId = t.properties?.[DBT_MODEL];
  const modelName = modelId ? modelId.split('.').pop() ?? modelId : undefined;
  return (
    <section className="preview detail view" data-testid="detail" data-kind="view">
      <header>
        <h2 className="mono">{t.name}<span className="muted"> · {mode === 'simple' ? 'a question, answered live' : 'view'} · {t.columns.length} columns</span></h2>
        <button type="button" className="quiet" onClick={onClose} disabled={!!busy}>Close</button>
      </header>
      <Command line={describeCommand(t.name)} />
      <pre className="sql" data-testid="view-sql">{t.view_sql}</pre>
      <dl className="facts">
        <dt>Where</dt><dd data-testid="detail-where">{mode === 'simple' ? 'not stored: the rows are computed from the tables each time it is asked' : <span>a view in the catalog; the rows are computed from its query each time</span>}</dd>
        <dt>Version</dt><dd data-testid="view-version" title={t.freshness ?? ''}>{t.snapshots} {t.snapshots === 1 ? 'version' : 'versions'} · this one {ago(t.freshness)}</dd>
        <dt>{mode === 'simple' ? 'Comes from' : 'Model'}</dt>
        <dd data-testid="view-model">
          {modelName ? (
            <span>
              {mode === 'simple' ? `the question ${modelName}` : <span className="mono">{modelId}</span>}; {mode === 'simple' ? 'refreshing it on the Questions screen' : <code>lakelet run {modelName}</code>} rewrites this view
            </span>
          ) : (
            <span className="muted">{mode === 'simple' ? 'not a saved question: a view put in the catalog directly' : 'not a dbt model: put in the catalog directly (the REST catalog, or the Python API)'}</span>
          )}
        </dd>
      </dl>
      <table className="columns">
        <thead><tr><th>Column</th><th>Iceberg</th></tr></thead>
        <tbody>
          {t.columns.map(([name, type]) => (
            <tr key={name}><td className="mono">{name}</td><td className="mono muted">{type}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted" data-testid="no-snapshots">A view has versions, not snapshots: nothing is stored for it, so there is nothing to expire.</p>
      {sample && <SampleBlock t={t} sample={sample} />}
      {error && <div className="error" data-testid="detail-error"><pre>{error}</pre></div>}
      <footer className="actions">
        <button type="button" className="quiet" onClick={onSample} disabled={!!busy} data-testid="sample-rows">Sample rows</button>
        {modelName && <Command line={runCommand([modelName])} label={`${w.runOne}: copy as command`} />}
      </footer>
    </section>
  );
}

export function TableDetail(props: TableDetailProps) {
  const { table: t, sample, busy, error, onSample, onExpire, onRefresh, onClose } = props;
  if (t.kind === 'view') return <ViewDetail {...props} mode={props.mode ?? 'technical'} />;
  const reclaimable = t.expirable_snapshots > 0;
  return (
    <section className="preview detail" data-testid="detail">
      <header>
        <h2 className="mono">{t.name}<span className="muted"> · {t.rows.toLocaleString()} rows · {humanBytes(t.bytes)} · {t.columns.length} columns</span></h2>
        <button type="button" className="quiet" onClick={onClose} disabled={!!busy}>Close</button>
      </header>
      <Command line={describeCommand(t.name)} />
      <dl className="facts">
        <dt>Where</dt><dd data-testid="detail-where"><Where t={t} /></dd>
        <dt>Partitioning</dt><dd>{t.partitioning}</dd>
        <dt>Last written</dt><dd title={t.freshness ?? ''}>{ago(t.freshness)}{t.last_commit.operation ? ` (${t.last_commit.operation})` : ''}</dd>
        <dt>Format</dt><dd>Iceberg v{t.format_version}, {t.snapshots} {t.snapshots === 1 ? 'snapshot' : 'snapshots'}</dd>
      </dl>
      <table className="columns">
        <thead><tr><th>Column</th><th>Iceberg</th></tr></thead>
        <tbody>
          {t.columns.map(([name, type]) => (
            <tr key={name}><td className="mono">{name}</td><td className="mono muted">{type}</td></tr>
          ))}
        </tbody>
      </table>
      <h3>Snapshots</h3>
      <table className="snapshots" data-testid="snapshots">
        <thead><tr><th>When</th><th>Operation</th><th>Rows added</th><th>Files added</th><th>Rows after</th><th></th></tr></thead>
        <tbody>
          {t.snapshot_list.map((s) => (
            <tr key={s.id} data-testid={`snapshot-${s.id}`} className={s.expirable ? 'expirable' : ''}>
              <td title={s.timestamp}>{ago(s.timestamp)}</td>
              <td>{s.operation ?? '—'}</td>
              <td>{s.added_rows !== null ? s.added_rows.toLocaleString() : s.deleted_rows ? `−${s.deleted_rows.toLocaleString()}` : '—'}</td>
              <td>{s.added_files === null ? '—' : s.added_files.toLocaleString()}</td>
              <td>{s.total_rows === null ? '—' : s.total_rows.toLocaleString()}</td>
              <td className="muted">{s.current ? 'current' : s.expirable ? 'expirable' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" data-testid="reclaimable">
        {t.source
          ? 'An attached table is never expired: its files are not Lakelet\'s to delete.'
          : reclaimable
            ? `${t.expirable_snapshots} ${t.expirable_snapshots === 1 ? 'snapshot' : 'snapshots'} older than ${t.keep_days} days, ${humanBytes(t.reclaimable_bytes)} reclaimable.`
            : `Nothing to expire at the project's retention of ${t.keep_days} days.`}
      </p>
      {sample && <SampleBlock t={t} sample={sample} />}
      {error && <div className="error" data-testid="detail-error"><pre>{error}</pre></div>}
      <footer className="actions">
        <button type="button" className="quiet" onClick={onSample} disabled={!!busy} data-testid="sample-rows">Sample rows</button>
        {t.source ? (
          <button type="button" className="primary" onClick={onRefresh} disabled={!!busy} data-testid="refresh">{busy ?? 'Refresh'}</button>
        ) : (
          <button type="button" className="primary" onClick={onExpire} disabled={!!busy || !reclaimable} data-testid="expire">{busy ?? 'Expire snapshots'}</button>
        )}
        <Command line={t.source ? refreshCommand(t.name) : expireCommand(t.name)} />
      </footer>
    </section>
  );
}
