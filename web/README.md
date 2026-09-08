# lakelet.dev — marketing site

Static site built with [Astro](https://astro.build). Zero client-side framework; the only JavaScript shipped is the hero slider, the looping terminal replay, and the waitlist form handler.

```
npm install
npm run dev        # http://localhost:4321
npm run build      # -> dist/
npm run preview
```

## Layout

```
src/
  layouts/Base.astro       <head>, fonts, Nav, Footer, site-wide waitlist handler
  components/              Nav, Footer, Logo, Fish, Waitlist, Terminal, ReplayTerminal,
                           GaugeSlider, Verdicts, CompareBars, VendorCard, WorkerLadder
  data/
    nav.ts                 nav items, CTA, footer text, "what do you use today" options
    pricing.ts             every number with a dollar sign: plans, worker ladder, modeled month
    facts.ts               the dated DuckDB / AWS / Polaris facts
  styles/tokens.css        global tokens and shared primitives (page-specific CSS lives in each page)
  pages/                   index, app, how-it-runs, medallion, agents, pricing
public/                    favicon.svg, llms.txt   (robots.txt is generated: src/pages/robots.txt.ts)
functions/api/waitlist.ts  Cloudflare Pages Function that stores signups in KV
```

Clean URLs: `build.format = 'file'` emits `dist/pricing.html`, which every static host serves at `/pricing`.

## Changing things

- **A price, a vendor number, a worker size** → `src/data/pricing.ts`. The landing page bars, the pricing page cards and the size ladder all read from it.
- **Nav / footer / CTA text** → `src/data/nav.ts`.
- **A terminal transcript** → the `<pre>` inside the page; colour classes are `.p .w .g .y .r .b .o .d .k` (see `Terminal.astro`).
- **The looping demo** → `src/components/ReplayTerminal.astro` (lines are `<span class="ln ...">`; `cmd` lines are typed, `data-input="y"` pauses then types the answer).
- **Domain** → `site` in `astro.config.mjs` (drives canonical URLs, robots.txt and the sitemap); the GitHub Pages workflow overrides it via `SITE_URL` / `SITE_BASE`.
- **Internal links** → always `href={url('/path')}` (from `src/lib/url.ts`) so they work under a base path.

## Deploy (GitHub Pages)

The workflow at `.github/workflows/deploy-pages.yml` (repo root) builds `web/` and publishes it on every push to `main` that touches the site.

1. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. That's the only required step. The next push to `main` (or **Actions → Deploy site to GitHub Pages → Run workflow**) deploys to `https://hantswilliams.github.io/lakelet/`.
2. Links, CSS, favicon and the sitemap are all base-aware (`src/lib/url.ts`, `SITE_BASE`), so the subpath works without code changes. Always write internal links as `href={url('/pricing')}`, never `href="/pricing"`.
3. Custom domain (optional): add it under **Settings → Pages → Custom domain** (GitHub writes the `CNAME` file and handles HTTPS), point DNS at GitHub (`A` records to GitHub's Pages IPs, or a `CNAME` to `hantswilliams.github.io`), then add a repo **variable** `SITE_URL=https://lakelet.dev`. The workflow then builds with base `/` and the sitemap uses the real domain.
4. Waitlist: GitHub Pages is static only, so `functions/api/waitlist.ts` doesn't run there. Add a repo variable `PUBLIC_WAITLIST_URL` pointing at a Formspree form (`https://formspree.io/f/xxxx`), Buttondown, or any endpoint that accepts a `multipart/form-data` POST with `email` and `stack`. Without it the forms just log to the console and show the success state.

Local check of the GitHub Pages build: `SITE_URL=https://hantswilliams.github.io SITE_BASE=/lakelet npm run build && npm run preview`, then open `http://localhost:4321/lakelet/`.

## Deploy (Cloudflare Pages)

1. Push this folder to a repo; in Cloudflare Pages create a project from it.
   Build command `npm run build`, output directory `dist`, root directory `web` (if the repo root is the parent).
2. Waitlist: create a KV namespace, bind it to the Pages project as `WAITLIST`, and set the build env var `PUBLIC_WAITLIST_URL=/api/waitlist`. Without the env var the forms log to the console and show the success state (fine for previews).
3. Read signups: `npx wrangler kv key list --binding WAITLIST --remote`.

Any other static host (Netlify, Vercel, GitHub Pages) serves `dist/` as-is; point `PUBLIC_WAITLIST_URL` at Formspree/Buttondown/your own endpoint instead — see the comment in `Base.astro`.
