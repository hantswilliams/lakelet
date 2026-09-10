// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Screen 1 of the app brief: the tables panel, the drop zone, the preview, the import. A
// dropped path is previewed with /api/preview; import is /api/import on a click, in the mode
// the core allows (409 table_exists offers replace or append); the panel refreshes after.

import { useEffect, useState } from 'react';
import { Api, ApiError, type ImportMode, type Preview, type TableInfo } from '../lib/api';
import { importCommand, defaultName } from '../lib/command';
import { inTauri, onDrop, pickFiles, type Session } from '../lib/session';
import { Command } from '../components/Command';
import { DropZone } from '../components/DropZone';
import { PreviewPanel } from '../components/PreviewPanel';
import { TablesPanel } from '../components/TablesPanel';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Pending {
  path: string;
  folder: boolean;
  previews: Preview[];
  name: string;
  mode: ImportMode;
  exists?: string;
  error?: string;
}

interface Done {
  line: string;
  tables: TableInfo[];
}

export function Tables({ session, tables, onChanged }: { session: Session; tables: TableInfo[]; onChanged: () => Promise<void> }) {
  const api = new Api(session);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [dropError, setDropError] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const [done, setDone] = useState<Done>();

  // A9: a drop previews first. Many files dropped at once: the first is previewed and the
  // rest are named, until a partner asks for more (brief §7's last unknown).
  async function preview(paths: string[]) {
    const path = paths[0];
    if (!path) return;
    setDropError(undefined);
    setDone(undefined);
    setBusy(`reading ${path.split(/[\\/]/).pop()}…`);
    try {
      const previews = await api.preview(path);
      const folder = !/\.(csv|tsv|parquet|json|jsonl|xlsx)$/i.test(path); // a file the core previewed has one of its extensions
      setPending({ path, folder, previews, name: folder ? '' : previews[0].name, mode: 'create' });
      if (paths.length > 1) setDropError(`${paths.length} files dropped; previewing the first. Drop a folder to import several at once.`);
    } catch (e: unknown) {
      setDropError(message(e));
    } finally {
      setBusy(undefined);
    }
  }

  async function doImport(mode: ImportMode) {
    if (!pending) return;
    const name = pending.folder ? undefined : pending.name.trim() || defaultName(pending.path);
    setPending({ ...pending, mode, error: undefined });
    setBusy('importing…');
    try {
      const imported = await api.import(pending.path, mode, name);
      setDone({ line: importCommand(pending.path, mode, name), tables: imported });
      setPending(undefined);
      await onChanged();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'table_exists') {
        const m = /table (\S+) exists/.exec(e.message);
        setPending({ ...pending, mode, exists: m?.[1] ?? name ?? pending.path });
      } else {
        setPending({ ...pending, mode, error: message(e) });
      }
    } finally {
      setBusy(undefined);
    }
  }

  async function choose() {
    try {
      const paths = await pickFiles();
      if (paths.length) await preview(paths);
    } catch (e: unknown) {
      setDropError(message(e));
    }
  }

  useEffect(() => {
    const off = onDrop((e) => {
      if (e.kind === 'drop') { setOver(false); void preview(e.paths); }
      else setOver(e.kind === 'over');
    });
    return () => { off.then((f) => f()); };
  }, [session.port, session.token]); // a restart brings a new session and a new listener

  return (
    <>
      <TablesPanel tables={tables} />
      {done && (
        <section className="notice" data-testid="imported">
          <b>
            Imported {done.tables.map((t) => `${t.name} (${t.rows.toLocaleString()} rows)`).join(', ')}.
          </b>
          <Command line={done.line} />
        </section>
      )}
      {pending ? (
        <PreviewPanel
          path={pending.path}
          folder={pending.folder}
          previews={pending.previews}
          name={pending.name}
          mode={pending.mode}
          exists={pending.exists}
          error={pending.error}
          busy={busy}
          onName={(name) => setPending({ ...pending, name })}
          onImport={(mode) => void doImport(mode)}
          onCancel={() => setPending(undefined)}
        />
      ) : (
        <DropZone native={inTauri()} over={over} busy={busy} onPaths={(p) => void preview(p)} onChoose={() => void choose()} />
      )}
      {dropError && <section className="error" data-testid="drop-error"><pre>{dropError}</pre></section>}
    </>
  );
}
