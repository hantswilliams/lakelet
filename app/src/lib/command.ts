// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// "Copy as command" (app brief §1): every action in the app is a CLI verb, and the line the
// app shows is the exact line the CLI takes. Built here, in one place, so the tests can
// hold the app to it.

import type { ImportMode } from './api';

/** Quote for a POSIX shell only when the argument needs it. */
export const shellArg = (s: string): string => (/^[A-Za-z0-9_./~:@+=,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** The file's stem as the CLI would turn it into a table name (core `identifier`). */
export const defaultName = (path: string): string => {
  const file = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;
  const stem = file.includes('.') ? file.slice(0, file.lastIndexOf('.')) : file;
  const slug = stem.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'project';
  return /^[0-9]/.test(slug) ? `t_${slug}` : slug;
};

/** `lakelet import <path> [--name <n>] [--replace|--append]`, as `lakelet import --help` has it. */
export function importCommand(path: string, mode: ImportMode = 'create', name?: string): string {
  const parts = ['lakelet', 'import', shellArg(path)];
  if (name && name !== defaultName(path)) parts.push('--name', shellArg(name));
  if (mode === 'replace') parts.push('--replace');
  if (mode === 'append') parts.push('--append');
  return parts.join(' ');
}

export const previewCommand = (path: string): string => `${importCommand(path)} --preview`;

export const isRemote = (path: string): boolean => /^s3:\/\//i.test(path.trim());

/** The table name the core gives a prefix (`register.remote_name`): the last segment, the
 *  value of a `k=v` segment. */
export const remoteName = (prefix: string): string => {
  const segment = prefix.replace(/\/+$/, '').split('/').pop() ?? prefix;
  const value = segment.includes('=') ? segment.slice(segment.indexOf('=') + 1) : segment;
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'project';
  return /^[0-9]/.test(slug) ? `t_${slug}` : slug;
};

/** `lakelet tables discover [--anonymous] <prefix>`: the drop zone's line for an s3:// path. */
export const discoverCommand = (prefix: string, anonymous = false): string =>
  `lakelet tables discover${anonymous ? ' --anonymous' : ''} ${shellArg(prefix)}`;

/** `lakelet tables attach <name> [--anonymous] <prefix>`: the preview panel's line for a prefix. */
export const attachCommand = (name: string, prefix: string, anonymous = false): string =>
  `lakelet tables attach ${shellArg(name)}${anonymous ? ' --anonymous' : ''} ${shellArg(prefix)}`;

export const refreshCommand = (name: string): string => `lakelet tables refresh ${shellArg(name)}`;

/** The table detail's lines (real-data brief R7). */
export const describeCommand = (name: string): string => `lakelet tables describe ${shellArg(name)}`;
export const sampleCommand = (name: string, n = 5): string => `lakelet tables sample ${shellArg(name)}${n === 5 ? '' : ` -n ${n}`}`;
export const expireCommand = (name: string): string => `lakelet tables expire ${shellArg(name)}`;

export const initCommand = (folder: string): string => `lakelet init ${shellArg(folder)}`;

/** `--` comments outside string literals removed, so folding the SQL onto one line for the
 *  terminal cannot comment out what followed them. */
export function stripComments(sql: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += '\n';
    } else {
      out += ch;
    }
  }
  return out;
}

/** `lakelet config set <key> <value>`: the settings panel's line. */
export const configCommand = (key: string, value: string): string => `lakelet config set ${key} ${shellArg(value)}`;

/** `lakelet sql '<sql>' [--run-anyway]`: the query screen's line. */
export function sqlCommand(sql: string, runAnyway = false): string {
  const one = stripComments(sql).replace(/\s+/g, ' ').trim();
  return `lakelet sql ${shellArg(one)}${runAnyway ? ' --run-anyway' : ''}`;
}

/** The Gauge screen's lines (real-data brief R8). */
export const gaugeHistoryCommand = (last = 20): string => `lakelet gauge history${last === 20 ? '' : ` --last ${last}`}`;
export const gaugeExportCommand = (): string => 'lakelet gauge export';
export const gaugeResetCommand = (): string => 'lakelet gauge reset --yes';
export const gaugeProbeCommand = (): string => 'lakelet gauge probe';

/** The Models panel's lines (real-data brief R5, step 6): `lakelet run` builds the whole
 *  DAG, `lakelet run <model>` one model (and, through dbt's selector, only it), `--plan`
 *  estimates without building, `--run-anyway` runs a Red model here regardless. */
export function runCommand(select: string[] = [], opts: { plan?: boolean; runAnyway?: boolean } = {}): string {
  const parts = ['lakelet run', ...select.map(shellArg)];
  if (opts.plan) parts.push('--plan');
  if (opts.runAnyway) parts.push('--run-anyway');
  return parts.join(' ');
}
