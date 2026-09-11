// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Screen 1's tables panel: every table in the catalog with rows, size, columns, how long
// ago it was last written, and where its data is (local, or an attached prefix, public or
// not), from /api/tables. An attached table offers "Refresh" (D27).

import { ago, humanBytes, type TableInfo } from '../lib/api';

export interface TablesPanelProps {
  tables: TableInfo[];
  busy?: string;
  onRefresh?: (name: string) => void;
  /** A row opens the table's detail (real-data brief R7). */
  onOpen?: (name: string) => void;
}

function Where({ t }: { t: TableInfo }) {
  if (t.kind === 'view') return <span title={t.view_sql ?? ''} data-testid={`where-${t.name}`}>view</span>;
  if (!t.source) return <span>local</span>;
  return (
    <span title={t.source} className="where" data-testid={`where-${t.name}`}>
      {t.public ? 'public' : 'attached'} <span className="mono muted">{t.source.replace(/^s3:\/\//, '').split('/')[0]}/…</span>
    </span>
  );
}

export function TablesPanel({ tables, busy, onRefresh, onOpen }: TablesPanelProps) {
  return (
    <section className="tables" data-testid="tables">
      <h2>Tables</h2>
      {tables.length === 0 ? (
        <p className="muted">No tables yet. Drop a CSV, Parquet, Excel or JSON file below, or run <code>lakelet import &lt;file&gt;</code>.</p>
      ) : (
        <table>
          <thead><tr><th>Table</th><th>Rows</th><th>Size</th><th>Columns</th><th>Updated</th><th>Where</th></tr></thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.name} data-testid={`table-${t.name}`} className={onOpen ? 'clickable' : ''} onClick={() => onOpen?.(t.name)} title={onOpen ? `lakelet tables describe ${t.name}` : undefined}>
                <td className="mono">{t.name}</td>
                <td>{t.kind === 'view' ? '—' : t.rows.toLocaleString()}</td>
                <td>{t.kind === 'view' ? '—' : humanBytes(t.bytes)}</td>
                <td>{t.columns.length}</td>
                <td title={t.freshness ?? ''}>{ago(t.freshness)}</td>
                <td>
                  <Where t={t} />
                  {t.source && onRefresh && (
                    <button type="button" className="quiet small" onClick={(e) => { e.stopPropagation(); onRefresh(t.name); }} disabled={!!busy} data-testid={`refresh-${t.name}`}>Refresh</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
