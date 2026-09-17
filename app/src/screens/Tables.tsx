// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Screen 1 of the app brief: the tables panel, the drop zone, the preview, the import. A
// dropped path is previewed with /api/preview; import is /api/import on a click, in the mode
// the core allows (409 table_exists offers replace or append); the panel refreshes after.
// An s3:// prefix (real-data brief R4) is previewed the same way and attached in place with
// /api/tables/attach; an attached table's Refresh is /api/tables/{name}/refresh.

import { useEffect, useState } from 'react';
import { Api, ApiError, humanBytes, type Health, type ImportMode, type Preview, type TableDescription, type TableInfo } from '../lib/api';
import { attachCommand, expireCommand, importCommand, defaultName, isRemote, refreshCommand, relocateCommand } from '../lib/command';
import { inTauri, onDrop, pickFiles, type Session } from '../lib/session';
import type { Mode } from '../lib/vocabulary';
import { Command } from '../components/Command';
import { DropZone } from '../components/DropZone';
import { PreviewPanel } from '../components/PreviewPanel';
import { TablesPanel } from '../components/TablesPanel';
import { TableDetail } from '../components/TableDetail';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const humanFiles = (n: number | null | undefined) => `${(n ?? 0).toLocaleString()} ${n === 1 ? 'file' : 'files'}`;

interface Pending {
  path: string;
  folder: boolean;
  remote: boolean;
  anonymous: boolean;
  previews: Preview[];
  name: string;
  mode: ImportMode;
  exists?: string;
  error?: string;
}

interface Done {
  line: string;
  text: string;
}

export interface TablesProps {
  session: Session;
  tables: TableInfo[];
  /** The core's credentials, from health, for the drop zone's line. */
  aws?: Health['aws'];
  /** The folder this project's tables were written in, when it is not this one (T5). */
  movedFrom?: string | null;
  /** After a relocate: health and tables are read again. */
  onRelocated?: () => Promise<void>;
  /** Screen 8: the view detail's words (`lakelet run` or Refresh). */
  mode?: Mode;
  onChanged: () => Promise<void>;
  /** A detail to open on arrival (a lineage link on the Models screen named a table, G8);
   *  `onOpened` says it was, so the request is not repeated. */
  openName?: string;
  onOpened?: () => void;
  /** A lineage link named a model that is not in the catalog yet: the Models screen opens it. */
  onOpenModel?: (name: string) => void;
}

export function Tables({ session, tables, aws, movedFrom, onRelocated, mode = 'technical', onChanged, openName, onOpened, onOpenModel }: TablesProps) {
  const api = new Api(session);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [dropError, setDropError] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const [done, setDone] = useState<Done>();
  const [detail, setDetail] = useState<{ table: TableDescription; sample?: Record<string, unknown>[]; error?: string }>();

  // A9: a drop previews first. Many files dropped at once: the first is previewed and the
  // rest are named, until a partner asks for more (brief §7's last unknown).
  async function preview(paths: string[], anonymous = false) {
    const path = paths[0];
    if (!path) return;
    setDropError(undefined);
    setDone(undefined);
    setDetail(undefined);
    const remote = isRemote(path);
    setBusy(remote ? 'listing the prefix…' : `reading ${path.split(/[\\/]/).pop()}…`);
    try {
      const previews = await api.preview(path, undefined, anonymous);
      const folder = !remote && !/\.(csv|tsv|parquet|json|jsonl|xlsx)$/i.test(path); // a file the core previewed has one of its extensions
      setPending({ path, folder, remote, anonymous, previews, name: folder ? '' : previews[0].name, mode: 'create' });
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
      setDone({
        line: importCommand(pending.path, mode, name),
        text: `Imported ${imported.map((t) => `${t.name} (${t.rows.toLocaleString()} rows)`).join(', ')}.`,
      });
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

  async function attach() {
    if (!pending) return;
    const name = pending.name.trim() || pending.previews[0].name;
    setPending({ ...pending, error: undefined });
    setBusy('attaching…');
    try {
      const info = await api.attach(name, pending.path, pending.anonymous);
      setDone({
        line: attachCommand(name, pending.path, pending.anonymous),
        text: `Attached ${info.name} (${info.rows.toLocaleString()} rows in ${humanFiles(pending.previews[0].files)}) in place; nothing was copied.`,
      });
      setPending(undefined);
      await onChanged();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'table_exists') {
        setPending({ ...pending, exists: name, error: `Table ${name} already exists; pick another name.` });
      } else {
        setPending({ ...pending, error: message(e) });
      }
    } finally {
      setBusy(undefined);
    }
  }

  async function refresh(name: string) {
    setDropError(undefined);
    setBusy(`refreshing ${name}…`);
    try {
      const r = await api.refresh(name);
      setDone({
        line: refreshCommand(name),
        text: `Refreshed ${r.name}: ${r.added} ${r.added === 1 ? 'file' : 'files'} added; ${r.files} files, ${r.rows.toLocaleString()} rows.`,
      });
      await onChanged();
      if (detail?.table.name === name) setDetail({ table: await api.describe(name) });
    } catch (e: unknown) {
      if (detail?.table.name === name) setDetail({ ...detail, error: message(e) });
      else setDropError(message(e));
    } finally {
      setBusy(undefined);
    }
  }

  /** `lakelet relocate` (T5): the folder moved; the tables' locations are rewritten under it. */
  async function relocate() {
    setDropError(undefined);
    setBusy('relocating…');
    try {
      const r = await api.relocate();
      setDone({
        line: relocateCommand(),
        text: `Relocated ${r.relocated.length} ${r.relocated.length === 1 ? 'table' : 'tables'} from ${r.old_root ?? 'where they were'}: ${r.relocated.join(', ') || 'none'}${r.skipped.length ? `; skipped ${r.skipped.join(', ')}` : ''}.`,
      });
      await onChanged();
      if (onRelocated) await onRelocated();
    } catch (e: unknown) {
      setDropError(message(e));
    } finally {
      setBusy(undefined);
    }
  }

  /** `lakelet tables attach --replace <name> <prefix>` (T2): after the prefix's files changed. */
  async function reattach(name: string, source: string, anonymous: boolean) {
    setDropError(undefined);
    setBusy(`registering ${name} again…`);
    try {
      const info = await api.attach(name, source, anonymous, true);
      setDone({
        line: attachCommand(name, source, anonymous, true),
        text: `Registered ${info.name} again: ${info.rows.toLocaleString()} rows in place at ${source}.`,
      });
      await onChanged();
      if (detail?.table.name === name) setDetail({ table: await api.describe(name) });
    } catch (e: unknown) {
      if (detail?.table.name === name) setDetail({ ...detail, error: message(e) });
      else setDropError(message(e));
    } finally {
      setBusy(undefined);
    }
  }

  // An open detail follows the table: a statement on screen 2 that wrote it (a delete, an
  // insert) changes the list, and the detail re-reads `describe` when its row changes.
  const detailName = detail?.table.name;
  const detailKey = tables.find((t) => t.name === detailName)?.freshness ?? null;
  useEffect(() => {
    if (!detailName || !detailKey) return;
    let live = true;
    api.describe(detailName).then((table) => { if (live) setDetail((d) => (d && d.table.name === detailName ? { ...d, table } : d)); }).catch(() => {});
    return () => { live = false; };
  }, [detailName, detailKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // R7: a row opens `describe` as a panel; sample and expire are the verbs they say.
  async function open(name: string) {
    setDropError(undefined);
    setPending(undefined);
    setBusy(`describing ${name}…`);
    try {
      setDetail({ table: await api.describe(name) });
    } catch (e: unknown) {
      setDropError(message(e));
    } finally {
      setBusy(undefined);
    }
  }

  // G8: a name on the lineage lines opens that detail; a model not built yet is the
  // Models screen's.
  useEffect(() => {
    if (!openName) return;
    void open(openName);
    onOpened?.();
  }, [openName]); // eslint-disable-line react-hooks/exhaustive-deps

  function follow(name: string, kind: 'table' | 'view' | 'model') {
    if (kind === 'model' && onOpenModel) onOpenModel(name);
    else void open(name);
  }

  async function sample() {
    if (!detail) return;
    setBusy('reading rows…');
    try {
      setDetail({ ...detail, sample: await api.sample(detail.table.name), error: undefined });
    } catch (e: unknown) {
      setDetail({ ...detail, error: message(e) });
    } finally {
      setBusy(undefined);
    }
  }

  async function expire() {
    if (!detail) return;
    const name = detail.table.name;
    setBusy('expiring…');
    try {
      const r = await api.expire(name);
      setDone({
        line: expireCommand(name),
        text: `Expired ${r.snapshots_removed} of ${r.snapshots_before} ${r.snapshots_before === 1 ? 'snapshot' : 'snapshots'} of ${r.name}; ${r.files_removed} ${r.files_removed === 1 ? 'file' : 'files'} removed, ${humanBytes(r.bytes_reclaimed)} reclaimed.`,
      });
      await onChanged();
      setDetail({ table: await api.describe(name) });
    } catch (e: unknown) {
      setDetail({ ...detail, error: message(e) });
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
      {movedFrom && (
        <section className="error" data-testid="moved">
          <b>{mode === 'simple' ? 'This project was moved.' : `This project was moved from ${movedFrom}.`}</b>
          <p>
            {tables.filter((t) => t.needs_relocate).length} {tables.filter((t) => t.needs_relocate).length === 1 ? 'table points' : 'tables point'} at the old folder.
            {mode === 'simple' ? ' Relocate updates them; nothing is copied.' : ' Every snapshot is kept; the old metadata files are orphans for expire.'}
          </p>
          <div className="actions">
            <button type="button" className="primary" disabled={!!busy} data-testid="relocate" onClick={() => void relocate()}>{busy ?? 'Relocate'}</button>
            <Command line={relocateCommand()} />
          </div>
        </section>
      )}
      <TablesPanel tables={tables} busy={busy} onRefresh={(name) => void refresh(name)} onOpen={(name) => void open(name)} />
      {done && (
        <section className="notice" data-testid="imported">
          <b>{done.text}</b>
          <Command line={done.line} />
        </section>
      )}
      {detail ? (
        <TableDetail
          table={detail.table}
          sample={detail.sample}
          mode={mode}
          busy={busy}
          error={detail.error}
          onSample={() => void sample()}
          onExpire={() => void expire()}
          onRefresh={() => void refresh(detail.table.name)}
          onReattach={() => detail.table.source && void reattach(detail.table.name, detail.table.source, !!detail.table.public)}
          onClose={() => setDetail(undefined)}
          session={session}
          onOpen={follow}
        />
      ) : pending ? (
        <PreviewPanel
          path={pending.path}
          folder={pending.folder}
          previews={pending.previews}
          name={pending.name}
          mode={pending.mode}
          exists={pending.exists}
          error={pending.error}
          busy={busy}
          onName={(name) => setPending({ ...pending, name, exists: undefined, error: undefined })}
          onImport={(mode) => void doImport(mode)}
          onAttach={() => void attach()}
          onCancel={() => setPending(undefined)}
        />
      ) : (
        <DropZone native={inTauri()} over={over} busy={busy} aws={aws} onPaths={(p, anonymous) => void preview(p, anonymous)} onChoose={() => void choose()} />
      )}
      {dropError && <section className="error" data-testid="drop-error"><pre>{dropError}</pre></section>}
    </>
  );
}
