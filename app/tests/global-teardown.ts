import { readState } from './sidecar';

export default async function globalTeardown() {
  try { process.kill(readState().pid, 'SIGTERM'); } catch { /* already gone */ }
}
