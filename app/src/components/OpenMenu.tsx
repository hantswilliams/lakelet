// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// "Open…" in the bar (app brief A10): the recent projects, then the folder dialog. Each
// opens in a new window; the one this window shows is left out.

import { useEffect, useRef, useState } from 'react';
import type { RecentProject } from '../lib/session';
import { isBucketPrefix } from '../screens/Welcome';

export interface OpenMenuProps {
  recent: RecentProject[];
  current?: string | null;
  disabled?: boolean;
  onOpen: (path: string) => void;
  /** The folder dialog; with a `warehouse` the new folder's tables live in that bucket
   *  (decisions W1: `lakelet init --warehouse s3://…`). */
  onPick: (warehouse?: string) => void;
}

export function OpenMenu({ recent, current, disabled, onOpen, onPick }: OpenMenuProps) {
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState<string>(); // the bucket row, when it is showing
  const ref = useRef<HTMLDivElement>(null);
  const others = recent.filter((p) => p.path !== current);
  const prefix = (bucket ?? '').trim();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="open-menu" ref={ref}>
      <button type="button" className="quiet" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-haspopup="menu" aria-expanded={open} data-testid="open-menu">
        Open…
      </button>
      {open && (
        <ul role="menu">
          {others.map((p) => (
            <li key={p.path} role="none">
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpen(p.path); }}>
                <b>{p.name}</b><span className="mono">{p.path}</span>
              </button>
            </li>
          ))}
          {others.length > 0 && <li role="separator" />}
          <li role="none">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick(); }}>Other folder…</button>
          </li>
          <li role="none">
            {bucket === undefined ? (
              <button type="button" role="menuitem" data-testid="open-bucket" onClick={() => setBucket('')}>New folder, tables in a bucket…<span>lakelet init &lt;folder&gt; --warehouse s3://…</span></button>
            ) : (
              <div className="bucket-row" data-testid="bucket-row">
                <input type="text" value={bucket} placeholder="s3://bucket/prefix" spellCheck={false} autoFocus data-testid="bucket-prefix" onChange={(e) => setBucket(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && isBucketPrefix(prefix)) { setOpen(false); setBucket(undefined); onPick(prefix); } }} />
                <button type="button" className="primary" disabled={!isBucketPrefix(prefix)} data-testid="bucket-pick" onClick={() => { setOpen(false); setBucket(undefined); onPick(prefix); }}>Choose folder…</button>
                <span>A folder that is not a project yet; its tables' files go to the bucket from the first import. Credentials come from the environment the app was started in.</span>
              </div>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}
