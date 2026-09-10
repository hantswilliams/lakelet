// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Screen 1's tables panel: every table in the catalog with rows, size, columns and how long
// ago it was last written, from /api/tables.

import { ago, humanBytes, type TableInfo } from '../lib/api';

export function TablesPanel({ tables }: { tables: TableInfo[] }) {
  return (
    <section className="tables" data-testid="tables">
      <h2>Tables</h2>
      {tables.length === 0 ? (
        <p className="muted">No tables yet. Drop a CSV, Parquet, Excel or JSON file below, or run <code>lakelet import &lt;file&gt;</code>.</p>
      ) : (
        <table>
          <thead><tr><th>Table</th><th>Rows</th><th>Size</th><th>Columns</th><th>Updated</th></tr></thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.name} data-testid={`table-${t.name}`}>
                <td className="mono">{t.name}</td>
                <td>{t.rows.toLocaleString()}</td>
                <td>{humanBytes(t.bytes)}</td>
                <td>{t.columns.length}</td>
                <td title={t.freshness ?? ''}>{ago(t.freshness)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
