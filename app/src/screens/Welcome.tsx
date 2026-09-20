// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The window before it has a project (app brief A10): open a folder, or one of the recent
// ten. A folder that is not a project yet is initialised by the shell; the terminal
// equivalent is shown beside the button, as every action in the app is.

import { useState } from 'react';
import type { RecentProject } from '../lib/session';

export interface WelcomeProps {
  recent: RecentProject[];
  /** True inside the app; a browser has no folder dialog and says so. */
  canPick: boolean;
  busy?: string;
  error?: string;
  /** The dialog, then `lakelet init` for a folder that is not a project yet — with
   *  `--warehouse` when the Advanced box names a bucket (decisions W1). */
  onPick: (warehouse?: string) => void;
  onOpen: (path: string) => void;
}

/** An `s3://bucket/prefix`, the only warehouse `init` takes besides its own folder. */
export const isBucketPrefix = (s: string): boolean => /^s3:\/\/[^/\s]+\/\S+$/.test(s.trim());

export function Welcome({ recent, canPick, busy, error, onPick, onOpen }: WelcomeProps) {
  const [advanced, setAdvanced] = useState(false);
  const [warehouse, setWarehouse] = useState('');
  const bucket = warehouse.trim();
  const bucketOk = bucket === '' || isBucketPrefix(bucket);
  return (
    <section className="welcome" data-testid="welcome">
      <h1>Open a folder</h1>
      <p className="muted">
        Any folder becomes a lakehouse: Lakelet keeps its catalog and tables inside it, next to your files.
        A folder that is not one yet is set up first, which is <code>lakelet init &lt;folder&gt;</code> in a terminal.
      </p>
      <div className="actions">
        <button type="button" className="primary" onClick={() => onPick(bucket || undefined)} disabled={!canPick || !!busy || !bucketOk} data-testid="open-folder">
          Open a folder…
        </button>
        {busy && <span className="muted" data-testid="busy">{busy}</span>}
        <button type="button" className="link" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced} data-testid="advanced">Advanced</button>
      </div>
      {advanced && (
        <div className="advanced" data-testid="advanced-box">
          <label>
            <span>Keep the tables in a bucket</span>
            <input type="text" value={warehouse} placeholder="s3://bucket/prefix" spellCheck={false} data-testid="warehouse" onChange={(e) => setWarehouse(e.target.value)} />
          </label>
          <p className="muted">
            For a folder that is not a project yet: every table's data and metadata go to the bucket from the first import, and the catalog stays
            in the folder. Fixed when the project is set up; a folder that is one already is opened as it is.
            In a terminal it is <code>lakelet init &lt;folder&gt; --warehouse {bucket || 's3://bucket/prefix'}</code>, with your AWS
            credentials in the environment the app was started from.
          </p>
          {!bucketOk && <p className="error-line" data-testid="warehouse-error">A warehouse is an <code>s3://bucket/prefix</code>; anything else stays in the folder.</p>}
        </div>
      )}
      {!canPick && (
        <p className="muted hint" data-testid="hint">
          In a browser there is no folder dialog. In development, export <code>LAKELET_SIDECAR</code> (the <code>lakelet</code> executable,
          for example <code>core/.venv/bin/lakelet</code>) and run <code>npm run tauri dev</code>; or start <code>lakelet serve</code> yourself
          and open <code>/?port=&amp;token=</code> from its <code>serve.json</code>.
        </p>
      )}
      {error && (
        <div className="error" data-testid="open-error">
          <b>That folder could not be opened.</b>
          <pre>{error}</pre>
        </div>
      )}
      {recent.length > 0 && (
        <div className="recent" data-testid="recent">
          <h2>Recent</h2>
          <ul>
            {recent.map((p) => (
              <li key={p.path}>
                <button type="button" onClick={() => onOpen(p.path)} disabled={!!busy}>
                  <b>{p.name}</b>
                  <span className="mono">{p.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
