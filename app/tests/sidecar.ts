// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Start a real sidecar for the tests: `lakelet init` on a temp folder, then `lakelet serve`
// with the dev origin allowed; the session comes from serve.json exactly as the shell reads it.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATE_FILE = join(tmpdir(), 'lakelet-app-e2e.json');

export interface Started { project: string; port: number; token: string; pid: number }

export function sidecarExecutable(): string {
  if (process.env.LAKELET_SIDECAR) return process.env.LAKELET_SIDECAR;
  const here = dirname(fileURLToPath(import.meta.url)); // an ES module: no __dirname
  const venv = resolve(here, '..', '..', 'core', '.venv', 'bin', 'lakelet');
  return existsSync(venv) ? venv : 'lakelet';
}

export async function startSidecar(): Promise<{ started: Started; child: ChildProcess }> {
  const exe = sidecarExecutable();
  const project = mkdtempSync(join(tmpdir(), 'lakelet-e2e-'));
  const init = spawnSync(exe, ['init', project, '--probe-mb', '0'], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`lakelet init failed:\n${init.stdout}\n${init.stderr}`);
  const child = spawn(exe, ['-C', project, 'serve', '--port', '0', '--memory-limit', '2GB'], {
    env: { ...process.env, LAKELET_DEV_ORIGIN: 'http://localhost:5173' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((ok, fail) => {
    let out = '';
    child.stdout!.on('data', (d) => { out += d; if (out.includes('serving ')) ok(); });
    child.stderr!.on('data', (d) => { out += d; });
    child.on('exit', (code) => fail(new Error(`sidecar exited (${code}) before serving:\n${out}`)));
    setTimeout(() => fail(new Error(`sidecar not ready in 30 s:\n${out}`)), 30_000);
  });
  const serve = JSON.parse(readFileSync(join(project, '.lakelet', 'serve.json'), 'utf8'));
  const started = { project, port: serve.port, token: serve.token, pid: child.pid! };
  writeFileSync(STATE_FILE, JSON.stringify(started));
  return { started, child };
}

export function readState(): Started {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Started;
}

export function pageUrl(s: Started): string {
  return `/?port=${s.port}&token=${encodeURIComponent(s.token)}&project=${encodeURIComponent(s.project)}`;
}
