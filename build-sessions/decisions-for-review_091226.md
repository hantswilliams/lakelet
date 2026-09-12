# Lakelet — decisions for review, September 12, 2026

*One item, outside any brief: a dark mode for the desktop app. Hants asked for it after the
versions round's step 2; it changes nothing in the core and nothing on the site. Tick Agree
or write the change under it. Nothing is built until it is decided.*

---

**D1. The app follows the operating system's theme, and a switch in the bar overrides it.**

*Recommend:* a **System | Light | Dark** switch at the right of the bar, beside Simple |
Technical, defaulting to System and remembered in the window's storage the way the mode is
(`lib/theme.ts`, the same shape as `lib/vocabulary.ts`'s `loadMode`/`saveMode`). System reads
`prefers-color-scheme`, so a window opens the way the machine is set and changes with it;
Light and Dark are a `data-theme` attribute on the document element that wins over the media
query.

What makes this cheap, and what it costs:

- `app.css` reads ten colour tokens and has seven hard-coded colours, five of them the same
  table-header grey. Those seven become two more tokens, and the dark palette is one block
  redefining twelve variables.
- `src/styles/tokens.css` is a copy of the site's, with "do not edit this copy" at its head
  (app brief A2). The dark palette therefore lives in an app-only `src/styles/theme.css`
  that overrides those tokens. The site is untouched: this is the app's window, not the
  brand.
- CodeMirror already themes off `var(--bg)` and `var(--muted)`, so the SQL editor follows
  with no change.
- The Vega chart does not: `lib/chart.ts` has four hard-coded hex constants. They are read
  from the document's computed styles at render time instead, so a chart is drawn in the
  theme the window is in. This is the only part that is code rather than CSS, and the only
  part with a way to go quietly wrong, so it gets its own test.
- The verdict colours (Green, Yellow, Red) keep their hues in both themes. They are the
  gauge's vocabulary and the site's; they lighten slightly in dark so they hold contrast on
  a dark panel, but a Red is recognisably the same Red.

*Not chosen:* following the operating system with no switch (nothing to remember and about
twenty-five lines, but someone who wants the app dark on a light desktop cannot ask);
a two-way Light | Dark switch (simpler state, but it ignores the machine's setting on first
run, so a dark desktop opens a bright window until the person finds the switch).

*Gates:* Vitest for `theme.ts` (the three choices, what is stored, what is applied, a window
with nothing stored following the system) and for the switch; Vitest for the chart's colours
coming from the document rather than constants; Playwright against a real sidecar: the switch
changes the window's background, the choice survives a reload, and System follows an emulated
dark machine.

- [x] Agree
- [ ] Change:

*Decided and built September 12, the same day. The log of that date, §7, has what it cost and
the one portability trap it turned up in the app's test suite.*
