import { startAll } from './sidecar';

export default async function globalSetup() {
  for (const child of await startAll()) child.unref();
}
