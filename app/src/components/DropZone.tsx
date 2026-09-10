// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Screen 1's drop zone (app brief A9): drop a file or a folder, or choose one, or type a
// path; the terminal command sits beside it. A drop previews first; import is a click.

import { useState, type FormEvent } from 'react';
import { importCommand } from '../lib/command';
import { Command } from './Command';

export interface DropZoneProps {
  /** True inside the app, where a drop carries paths and there is a file dialog. */
  native: boolean;
  over: boolean;
  busy?: string;
  onPaths: (paths: string[]) => void;
  onChoose: () => void;
}

export function DropZone({ native, over, busy, onPaths, onChoose }: DropZoneProps) {
  const [path, setPath] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = path.trim();
    if (p) onPaths([p]);
  }

  return (
    <section className={`drop${over ? ' over' : ''}`} data-testid="drop-zone">
      <div className="target">
        <b>{native ? 'Drop a file or a folder here' : 'Type a file or folder path'}</b>
        <span className="muted">CSV, TSV, Parquet, JSON, JSONL or Excel; a folder becomes one table per file. You see the columns before anything is written.</span>
        <form className="path" onSubmit={submit}>
          {native && (
            <button type="button" className="quiet" onClick={onChoose} disabled={!!busy} data-testid="choose-files">Choose files…</button>
          )}
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/orders.csv"
            aria-label="Path to preview"
            data-testid="path"
            disabled={!!busy}
          />
          <button type="submit" className="quiet" disabled={!!busy || !path.trim()} data-testid="preview-path">Preview</button>
        </form>
        {busy && <span className="muted" data-testid="drop-busy">{busy}</span>}
      </div>
      <aside>
        <span className="muted">In a terminal, the same thing is</span>
        <Command line={path.trim() ? importCommand(path.trim()) : 'lakelet import <file>'} />
      </aside>
    </section>
  );
}
