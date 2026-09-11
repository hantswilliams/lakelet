import { readStates } from './sidecar';

export default async function globalTeardown() {
  for (const s of readStates()) {
    try { process.kill(s.pid, 'SIGTERM'); } catch { /* already gone */ }
    if (s.s3) try { process.kill(s.s3.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}
