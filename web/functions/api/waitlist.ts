/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function: POST /api/waitlist
// Stores each signup in a KV namespace bound as WAITLIST (Pages → Settings →
// Functions → KV namespace bindings). Set PUBLIC_WAITLIST_URL=/api/waitlist in
// the Pages build environment and the site's forms will post here.
//
// Read them back with:  npx wrangler kv key list --binding WAITLIST --remote
//                       npx wrangler kv key get  --binding WAITLIST --remote <key>

interface Env { WAITLIST: KVNamespace }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const fd = await request.formData().catch(() => null);
  if (!fd) return json({ ok: false, error: 'bad form' }, 400);
  if (fd.get('_gotcha')) return json({ ok: true });                       // honeypot: pretend success

  const email = String(fd.get('email') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'invalid email' }, 400);

  const record = {
    email,
    stack: String(fd.get('stack') || ''),                                 // "What do you use today?"
    page: request.headers.get('referer') || '',
    country: request.headers.get('cf-ipcountry') || '',
    ua: request.headers.get('user-agent') || '',
    at: new Date().toISOString(),
  };
  // key = email so a repeat signup updates rather than duplicates; keep first-seen date
  const existing = await env.WAITLIST.get(email, 'json') as Partial<typeof record> | null;
  await env.WAITLIST.put(email, JSON.stringify({ ...record, first_at: existing?.first_at ?? record.at }));
  return json({ ok: true });
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
