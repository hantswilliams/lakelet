import { startSidecar } from './sidecar';

export default async function globalSetup() {
  const { child } = await startSidecar();
  child.unref();
}
