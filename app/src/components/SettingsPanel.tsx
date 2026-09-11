// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Settings (app brief, session 6 scope): only what the core reads from lakelet.toml, the
// engine's memory limit and threads, plus the calibration-sharing toggle with nothing behind
// it yet. Each save is `lakelet config set`, shown beside it. The engine reads these at
// start; the app gives each window its own memory share regardless (A8).

import { useEffect, useState } from 'react';
import { Api, type SettingKey, type Settings } from '../lib/api';
import { configCommand } from '../lib/command';
import { Command } from './Command';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const FIELDS: Array<{ key: SettingKey; label: string; help: string; kind: 'text' | 'bool' }> = [
  { key: 'engine.memory_limit', label: 'Memory limit for the CLI', help: '"auto" (DuckDB\'s 80% of RAM) or a size such as 8GB. Each app window gets its own share of RAM instead.', kind: 'text' },
  { key: 'engine.threads', label: 'Threads', help: '"auto" or a count.', kind: 'text' },
  { key: 'gauge.share_calibration', label: 'Share calibration', help: 'Whether this project would contribute anonymous gauge calibration. Nothing is sent yet; the switch is here so the file is ready.', kind: 'bool' },
  { key: 'catalog.keep_snapshots_days', label: 'Keep snapshots for', help: 'Days of table history `lakelet tables expire` keeps; the current snapshot always stays. Expiry runs only when asked.', kind: 'text' },
];

export function SettingsPanel({ api, onClose }: { api: Api; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();

  useEffect(() => {
    api.settings().then((s) => {
      setSettings(s);
      setDrafts(Object.fromEntries(Object.entries(s.settings).map(([k, v]) => [k, String(v)])));
    }).catch((e: unknown) => setError(message(e)));
  }, [api]);

  async function save(key: SettingKey, value: string) {
    setError(undefined);
    setSaved(undefined);
    try {
      const s = await api.setSetting(key, value);
      setSettings(s);
      setDrafts((d) => ({ ...d, [key]: String(s.settings[key]) }));
      setSaved(key);
    } catch (e: unknown) {
      setError(message(e));
    }
  }

  return (
    <section className="settings" data-testid="settings" role="dialog" aria-label="Settings">
      <header>
        <h2>Settings</h2>
        <button type="button" className="quiet" onClick={onClose} data-testid="settings-close">Close (Esc)</button>
      </header>
      {settings && <p className="muted">These are in <code>{settings.path}</code>; the core reads them when it starts.</p>}
      {error && <div className="error" data-testid="settings-error"><pre>{error}</pre></div>}
      {settings && FIELDS.map((f) => {
        const draft = drafts[f.key] ?? '';
        const current = String(settings.settings[f.key]);
        return (
          <div className="setting" key={f.key} data-testid={`setting-${f.key}`}>
            <label>
              <b>{f.label}</b>
              <span className="muted">{f.help}</span>
            </label>
            <div className="control">
              {f.kind === 'bool' ? (
                <input
                  type="checkbox"
                  checked={draft === 'true'}
                  onChange={(e) => { const v = e.target.checked ? 'true' : 'false'; setDrafts((d) => ({ ...d, [f.key]: v })); void save(f.key, v); }}
                  aria-label={f.label}
                  data-testid={`input-${f.key}`}
                />
              ) : (
                <>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') void save(f.key, draft); }}
                    aria-label={f.label}
                    className="mono"
                    data-testid={`input-${f.key}`}
                  />
                  <button type="button" className="quiet" onClick={() => void save(f.key, draft)} disabled={draft.trim() === current} data-testid={`save-${f.key}`}>
                    {saved === f.key ? 'saved' : 'Save'}
                  </button>
                </>
              )}
              <Command line={configCommand(f.key, draft.trim() || current)} />
            </div>
          </div>
        );
      })}
      <div className="keys">
        <h3>Keys</h3>
        <dl>
          <dt>⌘/Ctrl+Enter</dt><dd>run the SQL</dd>
          <dt>Esc</dt><dd>stop a running query; close this panel</dd>
          <dt>⌘/Ctrl+K</dt><dd>to the SQL box (the ask box, in a later session)</dd>
          <dt>⌘/Ctrl+,</dt><dd>settings</dd>
        </dl>
      </div>
    </section>
  );
}
