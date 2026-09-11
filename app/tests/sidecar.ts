// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// Start real sidecars for the tests: `lakelet init` on a temp folder, then `lakelet serve`
// with the dev origin allowed; the session comes from serve.json exactly as the shell reads
// it, and spawn-to-ready is measured the way the shell measures it. Four are started: the
// second with half the first's memory limit, as the shell gives a second window (A8); the
// third with a 20 M-row table for the streaming gate; the fourth with the gauge thresholds
// lowered so every query is Red; the fifth with a stand-in bucket (Moto, public-read) for
// the attach screen, its credentials in the sidecar's environment.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATE_FILE = join(tmpdir(), 'lakelet-app-e2e.json');

export interface Started {
  project: string; port: number; token: string; pid: number; readyMs: number; memoryLimit: string;
  /** The fifth sidecar's bucket: the Moto endpoint, its pid, and the file that makes it add a fourth Parquet file. */
  s3?: { endpoint: string; pid: number; flag: string; prefix: string };
}

export interface SidecarSpec { memoryLimit: string; big?: boolean; red?: boolean; s3?: boolean }

// Each spec file owns what it imports into a sidecar; the files run in parallel outside CI.
// step 0 → the first; step 2 → the second (and counts its tables); steps 3 and 4 → the
// third (big) and the fourth (Red); step 4's settings → the second's lakelet.toml only;
// the real-data round's attach test → the fifth (s3).
export const SIDECARS: SidecarSpec[] = [
  { memoryLimit: '2GB' },
  { memoryLimit: '1GB' },
  { memoryLimit: '2GB', big: true },
  { memoryLimit: '1GB', red: true },
  { memoryLimit: '1GB', s3: true },
];

export const BIG_ROWS = 20_000_000;

/** The venv's python beside the sidecar, for generating fixtures with DuckDB. */
export function venvPython(): string {
  return join(dirname(sidecarExecutable()), 'python');
}

export function sidecarExecutable(): string {
  if (process.env.LAKELET_SIDECAR) return process.env.LAKELET_SIDECAR;
  const here = dirname(fileURLToPath(import.meta.url)); // an ES module: no __dirname
  const venv = resolve(here, '..', '..', 'core', '.venv', 'bin', 'lakelet');
  return existsSync(venv) ? venv : 'lakelet';
}

/** The stand-in bucket: `tests/moto_fixture.py` on the venv's python, ready when it prints its endpoint. */
async function startMoto(project: string): Promise<{ endpoint: string; child: ChildProcess; flag: string }> {
  const here = dirname(fileURLToPath(import.meta.url));
  const flag = join(project, 'add-more');
  const child = spawn(venvPython(), [join(here, 'moto_fixture.py'), flag], { stdio: ['ignore', 'pipe', 'pipe'] });
  const endpoint = await new Promise<string>((ok, fail) => {
    let out = '';
    child.stdout!.on('data', (d) => {
      out += d;
      const m = /moto (http:\/\/\S+)/.exec(out);
      if (m) ok(m[1]);
    });
    child.stderr!.on('data', (d) => { out += d; });
    child.on('exit', (code) => fail(new Error(`moto exited (${code}) before serving:\n${out}`)));
    setTimeout(() => fail(new Error(`moto not ready in 30 s:\n${out}`)), 30_000);
  });
  return { endpoint, child, flag };
}

export async function startSidecar({ memoryLimit, big, red, s3 }: SidecarSpec): Promise<{ started: Started; child: ChildProcess; extra?: ChildProcess }> {
  const exe = sidecarExecutable();
  const project = mkdtempSync(join(tmpdir(), 'lakelet-e2e-'));
  const init = spawnSync(exe, ['init', project, '--probe-mb', '0'], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`lakelet init failed:\n${init.stdout}\n${init.stderr}`);
  if (red) {
    // the thresholds the core's own Red test uses: everything is Red here
    const toml = join(project, 'lakelet.toml');
    writeFileSync(toml, readFileSync(toml, 'utf8')
      .replace('green_max_seconds = 60', 'green_max_seconds = 0.0000001')
      .replace('yellow_max_seconds = 600', 'yellow_max_seconds = 0.0000002'));
    writeFileSync(join(project, 'orders.csv'), 'id,customer,amt\n1,c1,1.5\n2,c2,3.0\n3,c1,4.5\n');
    const imported = spawnSync(exe, ['-C', project, 'import', join(project, 'orders.csv')], { encoding: 'utf8' });
    if (imported.status !== 0) throw new Error(`import failed:\n${imported.stdout}\n${imported.stderr}`);
  }
  if (big) {
    // 20 M rows through DuckDB into Parquet, then imported as an Iceberg table
    const parquet = join(project, 'big.parquet');
    const gen = spawnSync(venvPython(), ['-c',
      `import duckdb; duckdb.sql("COPY (SELECT range AS id, random() AS x, 'c' || (range % 97) AS c, range * 3 AS y FROM range(${BIG_ROWS})) TO '${parquet}' (FORMAT parquet)")`,
    ], { encoding: 'utf8' });
    if (gen.status !== 0) throw new Error(`could not generate big.parquet:\n${gen.stderr}`);
    const t = Date.now();
    const imported = spawnSync(exe, ['-C', project, 'import', parquet], { encoding: 'utf8' });
    if (imported.status !== 0) throw new Error(`import of big.parquet failed:\n${imported.stdout}\n${imported.stderr}`);
    console.log(`big: ${BIG_ROWS.toLocaleString()} rows imported in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
  let moto: { endpoint: string; child: ChildProcess; flag: string } | undefined;
  const env: NodeJS.ProcessEnv = { ...process.env, LAKELET_DEV_ORIGIN: 'http://localhost:5173' };
  if (s3) {
    moto = await startMoto(project);
    Object.assign(env, { AWS_ENDPOINT_URL: moto.endpoint, AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', AWS_REGION: 'us-east-1' });
    delete env.AWS_PROFILE;
  }
  const t0 = Date.now();
  const child = spawn(exe, ['-C', project, 'serve', '--port', '0', '--memory-limit', memoryLimit], {
    env,
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
  const started: Started = { project, port: serve.port, token: serve.token, pid: child.pid!, readyMs: Date.now() - t0, memoryLimit };
  if (moto) started.s3 = { endpoint: moto.endpoint, pid: moto.child.pid!, flag: moto.flag, prefix: 's3://lakelet-test/raw/events/' };
  return { started, child, extra: moto?.child };
}

export async function startAll(): Promise<ChildProcess[]> {
  const children: ChildProcess[] = [];
  const states: Started[] = [];
  for (const spec of SIDECARS) {
    const { started, child, extra } = await startSidecar(spec);
    children.push(child);
    if (extra) children.push(extra);
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
