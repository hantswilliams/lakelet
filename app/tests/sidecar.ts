// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Start real sidecars for the tests: `lakelet init` on a temp folder, then `lakelet serve`
// with the dev origin allowed; the session comes from serve.json exactly as the shell reads
// it, and spawn-to-ready is measured the way the shell measures it. Two are started, the
// second with half the first's memory limit, as the shell gives a second window (A8).

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATE_FILE = join(tmpdir(), 'lakelet-app-e2e.json');

export interface Started { project: string; port: number; token: string; pid: number; readyMs: number; memoryLimit: string }

export const LIMITS = ['2GB', '1GB'] as const;

export function sidecarExecutable(): string {
  if (process.env.LAKELET_SIDECAR) return process.env.LAKELET_SIDECAR;
  const here = dirname(fileURLToPath(import.meta.url)); // an ES module: no __dirname
  const venv = resolve(here, '..', '..', 'core', '.venv', 'bin', 'lakelet');
  return existsSync(venv) ? venv : 'lakelet';
}

export async function startSidecar(memoryLimit: string): Promise<{ started: Started; child: ChildProcess }> {
  const exe = sidecarExecutable();
  const project = mkdtempSync(join(tmpdir(), 'lakelet-e2e-'));
  const init = spawnSync(exe, ['init', project, '--probe-mb', '0'], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`lakelet init failed:\n${init.stdout}\n${init.stderr}`);
  const t0 = Date.now();
  const child = spawn(exe, ['-C', project, 'serve', '--port', '0', '--memory-limit', memoryLimit], {
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
  const started = { project, port: serve.port, token: serve.token, pid: child.pid!, readyMs: Date.now() - t0, memoryLimit };
  return { started, child };
}

export async function startAll(): Promise<ChildProcess[]> {
  const children: ChildProcess[] = [];
  const states: Started[] = [];
  for (const limit of LIMITS) {
    const { started, child } = await startSidecar(limit);
    children.push(child);
    states.push(started);
  }
  writeFileSync(STATE_FILE, JSON.stringify(states));
  return children;
}

export function readStates(): Started[] {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Started[];
}

/** The first sidecar: what the step 0 tests use. */
export function readState(): Started {
  return readStates()[0];
}

export function pageUrl(s: Started): string {
  return `/?port=${s.port}&token=${encodeURIComponent(s.token)}&project=${encodeURIComponent(s.project)}&ready_ms=${s.readyMs}`;
}
