// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// New project… (decisions P1), from the welcome screen and from Open…: a name under a
// parent folder (the default one, or the dialog's), and where the tables go — in this
// folder, or in a bucket you own. A bucket is checked before the folder is made: the
// credentials the environment offers, and one object written under the prefix and
// removed, so the first import is not the first thing to fail. The line beside the button
// is the `lakelet init` it runs. "In this folder" and "in a bucket" are the words: the
// catalog and the engine are here either way.

import { useEffect, useState, type FormEvent } from 'react';
import type { Health } from '../lib/api';
import { bucketCheckCommand, initCommand } from '../lib/command';
import type { BucketCheck } from '../lib/session';
import { isBucketPrefix } from '../screens/Welcome';
import { Command } from './Command';
import { NO_CREDENTIALS } from './DropZone';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface NewProjectProps {
  /** True inside the app; a browser can fill the form and check a bucket, not make a folder. */
  canCreate: boolean;
  /** Where the folder goes unless another parent is chosen; undefined while the shell is asked. */
  defaultParent?: string | null;
  /** The core's credentials from health, when this window has a core; the line says so early. */
  aws?: Health['aws'];
  onChooseParent: () => Promise<string | null>;
  check: (prefix: string) => Promise<BucketCheck>;
  onCreate: (parent: string, name: string, warehouse?: string) => Promise<void>;
  onClose: () => void;
}

const joinPath = (parent: string, name: string) => `${parent.replace(/[\\/]+$/, '')}${parent.includes('\\') && !parent.includes('/') ? '\\' : '/'}${name}`;

export const isProjectName = (s: string): boolean => {
  const name = s.trim();
  return name.length > 0 && name !== '.' && name !== '..' && !/[\\/]/.test(name);
};

export function NewProject({ canCreate, defaultParent, aws, onChooseParent, check, onCreate, onClose }: NewProjectProps) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState<string>(defaultParent ?? '');
  const [where, setWhere] = useState<'folder' | 'bucket'>('folder');
  const [prefix, setPrefix] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<BucketCheck>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { if (defaultParent && !parent) setParent(defaultParent); }, [defaultParent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const bucket = where === 'bucket';
  const trimmed = prefix.trim();
  const prefixOk = isBucketPrefix(trimmed);
  const nameOk = isProjectName(name);
  const folder = parent && nameOk ? joinPath(parent, name.trim()) : '';
  const noCredentials = bucket && aws !== undefined && !aws.configured;
  const checkedThis = result && result.prefix === trimmed;
  const canSubmit = canCreate && !!parent && nameOk && !busy && !checking && (!bucket || prefixOk);

  async function runCheck(): Promise<BucketCheck | undefined> {
    setError(undefined);
    setChecking(true);
    try {
      const r = await check(trimmed);
      setResult(r);
      return r;
    } catch (e: unknown) {
      setError(message(e));
      return undefined;
    } finally {
      setChecking(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(undefined);
    if (bucket) {
      const r = checkedThis ? result : await runCheck();
      if (!r || !r.ok) return; // the sentence under the field says why
    }
    setBusy(true);
    try {
      await onCreate(parent, name.trim(), bucket ? trimmed : undefined);
    } catch (err: unknown) {
      setError(message(err));
      setBusy(false);
    }
  }

  async function chooseParent() {
    try {
      const picked = await onChooseParent();
      if (picked) setParent(picked);
    } catch (err: unknown) {
      setError(message(err));
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" data-testid="new-project">
      <form className="new-project" onSubmit={submit}>
        <header>
          <h2 id="new-project-title">New project</h2>
          <button type="button" className="quiet" onClick={onClose} data-testid="new-project-close">Cancel (Esc)</button>
        </header>
        <label className="field">
          <span>Name</span>
          <input type="text" value={name} autoFocus spellCheck={false} placeholder="acme" data-testid="project-name" onChange={(e) => setName(e.target.value)} />
          {name.trim() && !nameOk && <em className="error-line" data-testid="name-error">One folder name, without slashes.</em>}
        </label>
        <div className="field">
          <span>Where</span>
          <div className="parent">
            <code className="mono" data-testid="project-parent">{parent || (canCreate ? '…' : 'the app chooses a folder; a browser cannot')}</code>
            {canCreate && <button type="button" className="quiet" onClick={() => void chooseParent()} disabled={busy} data-testid="choose-parent">Choose…</button>}
          </div>
          {folder && <em className="muted" data-testid="project-folder">{folder}</em>}
        </div>
        <fieldset className="where" data-testid="where">
          <legend>The tables</legend>
          <label className="check">
            <input type="radio" name="where" checked={!bucket} onChange={() => setWhere('folder')} data-testid="where-folder" />
            <span><b>In this folder</b> <span className="muted">— under <code>warehouse/</code>, next to the catalog. The default.</span></span>
          </label>
          <label className="check">
            <input type="radio" name="where" checked={bucket} onChange={() => setWhere('bucket')} data-testid="where-bucket" />
            <span><b>In a bucket you own</b> <span className="muted">— every table's files go to the prefix from the first import; the catalog stays in the folder. Fixed when the project is made.</span></span>
          </label>
          {bucket && (
            <div className="bucket">
              <input type="text" value={prefix} placeholder="s3://bucket/prefix" spellCheck={false} data-testid="warehouse" onChange={(e) => { setPrefix(e.target.value); setError(undefined); }} />
              <button type="button" className="quiet" onClick={() => void runCheck()} disabled={!prefixOk || checking || busy} data-testid="check-bucket">{checking ? 'checking…' : 'Check the bucket'}</button>
              {trimmed && !prefixOk && <em className="error-line" data-testid="warehouse-error">A warehouse is an <code>s3://bucket/prefix</code>.</em>}
              {noCredentials && !checkedThis && <em className="muted" data-testid="no-credentials">{NO_CREDENTIALS}</em>}
              {checkedThis && (
                <em className={result.ok ? 'ok-line' : 'error-line'} data-testid="check-result" data-ok={result.ok ? 'true' : 'false'}>{result.sentence}</em>
              )}
              <span className="muted">Credentials come from the environment the app was started in; nothing is created in your account. In a terminal the check is <code>{bucketCheckCommand(trimmed || 's3://bucket/prefix')}</code>.</span>
            </div>
          )}
        </fieldset>
        {error && <div className="error" data-testid="new-project-error"><pre>{error}</pre></div>}
        <footer className="actions">
          <button type="submit" className="primary" disabled={!canSubmit} data-testid="create-project">{busy ? 'making it…' : bucket && !checkedThis ? 'Check and create' : 'Create'}</button>
          <Command line={folder ? initCommand(folder, bucket ? trimmed || 's3://bucket/prefix' : undefined) : `lakelet init <folder>${bucket ? ` --warehouse ${trimmed || 's3://bucket/prefix'}` : ''}`} />
        </footer>
        {!canCreate && <p className="muted hint">In a browser the folder cannot be made; the app does it. The bucket check works here when a core is running.</p>}
      </form>
    </div>
  );
}
