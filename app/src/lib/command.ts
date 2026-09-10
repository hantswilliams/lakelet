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

export const initCommand = (folder: string): string => `lakelet init ${shellArg(folder)}`;

/** `lakelet sql '<sql>' [--run-anyway]`: the query screen's line. */
export function sqlCommand(sql: string, runAnyway = false): string {
  const one = sql.replace(/\s+/g, ' ').trim();
  return `lakelet sql ${shellArg(one)}${runAnyway ? ' --run-anyway' : ''}`;
}
