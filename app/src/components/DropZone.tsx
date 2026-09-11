// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Screen 1's drop zone (app brief A9): drop a file or a folder, or choose one, or type a
// path; the terminal command sits beside it. A drop previews first; import is a click. An
// `s3://` prefix (real-data brief R4) is previewed the same way and attached in place, with
// the public-bucket switch and, when the core has no credentials, the line saying so.

import { useState, type FormEvent } from 'react';
import type { Health } from '../lib/api';
import { discoverCommand, importCommand, isRemote } from '../lib/command';
import { Command } from './Command';

export interface DropZoneProps {
  /** True inside the app, where a drop carries paths and there is a file dialog. */
  native: boolean;
  over: boolean;
  busy?: string;
  /** The core's credentials, from /api/health; undefined until health has answered. */
  aws?: Health['aws'];
  onPaths: (paths: string[], anonymous?: boolean) => void;
  onChoose: () => void;
}

export const NO_CREDENTIALS =
  'The core has no AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or AWS_PROFILE) in the shell that starts the app and restart the core, or tick "public bucket" for a dataset that needs none.';

export function DropZone({ native, over, busy, aws, onPaths, onChoose }: DropZoneProps) {
  const [path, setPath] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const remote = isRemote(path);
  const noCredentials = remote && !anonymous && aws !== undefined && !aws.configured;

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = path.trim();
    if (p) onPaths([p], remote && anonymous);
  }

  const line = !path.trim()
    ? 'lakelet import <file>'
    : remote
      ? discoverCommand(path.trim(), anonymous)
      : importCommand(path.trim());

  return (
    <section className={`drop${over ? ' over' : ''}`} data-testid="drop-zone">
      <div className="target">
        <b>{native ? 'Drop a file or a folder here' : 'Type a file or folder path'}</b>
        <span className="muted">CSV, TSV, Parquet, JSON, JSONL or Excel; a folder becomes one table per file; an <code>s3://bucket/prefix/</code> of Parquet is attached in place, nothing copied. You see the columns before anything is written.</span>
        <form className="path" onSubmit={submit}>
          {native && (
            <button type="button" className="quiet" onClick={onChoose} disabled={!!busy} data-testid="choose-files">Choose files…</button>
          )}
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/orders.csv or s3://bucket/prefix/"
            aria-label="Path to preview"
            data-testid="path"
            disabled={!!busy}
          />
          <button type="submit" className="quiet" disabled={!!busy || !path.trim()} data-testid="preview-path">Preview</button>
        </form>
        {remote && (
          <label className="check" data-testid="public-bucket">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} disabled={!!busy} />
            Public bucket (no credentials)
          </label>
        )}
        {noCredentials && <span className="muted" data-testid="no-credentials">{NO_CREDENTIALS}</span>}
        {busy && <span className="muted" data-testid="drop-busy">{busy}</span>}
      </div>
      <aside>
        <span className="muted">In a terminal, the same thing is</span>
        <Command line={line} />
      </aside>
    </section>
  );
}
