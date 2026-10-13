---
name: astro-i18n
description: >-
  Adopt @edgekits/astro-i18n in an Astro + Cloudflare Workers project: edge-native i18n with
  translations in Workers KV, a per-namespace edge cache purged on change, typed keys, and a
  locale-routing middleware; then localize forms (errors as codes, island-free, no zod in the
  browser) and multilingual SEO (html lang, hreflang, sitemap, RSS, llms.txt). Use when the user
  asks to install it, "add i18n", "add multilingual", "make the site multilingual", "добавь
  мультиязычность", "translate the site", add a locale or language, add a translation namespace,
  localize a form, or add hreflang tags.
---

# Astro i18n (EdgeKits)

Adopts the npm package `@edgekits/astro-i18n` and builds on it. **The package README
(`node_modules/@edgekits/astro-i18n/README.md` after `npm i`) is the installation and
configuration reference: read it, follow it, do not restate it.**

## Mental model

- Translations are data in Workers KV (`<locale>/<namespace>` JSON), fetched per request on the
  server; changing copy is a KV write (`edgekits-i18n migrate`), not a redeploy.
- Each namespace is cached at the edge under its own URL; `migrate` purges only the changed ones
  through the Cloudflare Purge API.
- The default locale's JSON is the schema: the CLI generates `I18n.Schema`, so `t.ns.key` is typed.
- `Astro.locals.uiLocale` is the URL's locale (routing, `<html lang>`, SEO, switcher);
  `translationLocale` is the locale to fetch (falls back to the default if that locale has no JSON).
- `./config` and `./format` are Node-safe; `./runtime` and `./middleware` run only in workerd.

## Workflow A: adopt the package

### A0. Ask first, and wait for the answers

1. Which locales, and which is the default? Codes are lowercase (`pt-br`, not `pt-BR`).
2. Is this an existing Astro + `@astrojs/cloudflare` project? This skill does not scaffold
   Astro; if there is no project, say so and stop. Without the Cloudflare adapter, stop too:
   the package is Workers- and KV-specific.
3. Does the site serve markdown endpoints (`/blog/x.md`, `llms.txt` twins)? If so, in which
   locale? That is `markdownLocale`; without it, `.md` paths pass through untouched.
4. Should a visitor's country pick the locale when there is no cookie and no Accept-Language
   match? If so, which countries map to which locale? That is `countryToLocale`; without it the
   geo step is skipped.
5. Middleware: `auto` (the integration registers it) or `manual` (the project already has a
   `src/middleware.ts` sequence to slot it into)? If a `src/middleware.ts` exists, ask.
6. Flags in the switcher? If yes, a locale's flag is its `countryCode` (ISO 3166-1 alpha-2,
   lowercase). A regional locale takes its region (`pt-br` → `br`, `en-gb` → `gb`); for a
   language-only locale propose the obvious country (`en` → `us`, `pt` → `pt`, `es` → `es`)
   and let the user confirm. Show the full list back before writing the config. SVGs: the
   `flag-icons` npm package (MIT), or the project's own.

Defaults if the user does not care: `missingTranslationBanner: true`, no `countryToLocale`, no
`markdownLocale`, `auto` middleware, flags on from `flag-icons` by the rule above.

### A1. Install and follow the README in order

`npm i @edgekits/astro-i18n`, then read the README and follow these sections in order:

1. Requirements (Astro and adapter versions, `output: 'server'`, `wrangler.jsonc`).
2. Quick start 1–6: Install; Bind a KV namespace; Write `edgekits-i18n.config.ts` (the A0
   answers; no `countryCode` when flags are off); Add the integration; Write translations;
   Generate and seed.
3. Route layout: move every existing page under `src/pages/[lang]/`, same relative path
   (`about.astro` → `[lang]/about.astro`). No `index.astro` stays at the root: the
   middleware redirects `/`. Non-localized endpoints (`robots.txt`, `sitemap`, `/api/*`) and
   `public/` files stay at the root. Layouts set `<html lang>` from `Astro.locals.uiLocale`
   through `toIetfTag`. Code: `references/seo.md` → Route layout.
4. Quick start 7–8: Use translations in a page; Runtime switches.
5. Reference: Which entry to import; `countryToLocale`; `markdownLocale`; Styling the
   components. Flags on: `references/seo.md` → Flags.

Starter files: copy `assets/locales/common.json` and `assets/locales/messages.json` into
`locales/<default>/` and translate them per locale (`messages.json` holds the banner texts and
the form error codes).

Creating the KV namespace (`wrangler kv namespace create`) touches the user's Cloudflare
account: ask before running it. Until then, local development works with any 32-character hex
id (the CLI rejects other shapes).

### A2. Generated files and the purge baseline

- The CLI writes `i18n-data.json`, `src/i18n.generated.d.ts`, `<generatedDir>/runtime-constants.ts`
  and `<generatedDir>/fallbacks.generated.ts`. Commit them; regenerate with the CLI after every
  JSON edit; never edit them by hand.
- `.i18n-hashes.json` is written only by a successful `migrate` and records what production KV
  holds. Commit it right after each `migrate`. `seed` never touches it. `migrate` refuses to run
  while it has uncommitted changes; do not "fix" that by editing or deleting the file: ask the
  user which command last wrote it (the error message explains both cases).

### A3. Verify

Run `references/checklists.md` → "Verify: adoption". Do not skip it. Follow-up requests (add a
locale, add a namespace, edit copy in production) are recipes in the same file.

## Workflow B: create or localize a form

Read `references/forms.md`; it assumes Workflow A is done. Ask first: the fields and their
rules, the submission target (an Astro Action by default), and where the form renders.

Two invariants, whatever the field kit:

1. **Errors as codes.** Validation and server layers emit stable codes (`INVALID_EMAIL`), never
   human text; the `messages` namespace holds the text for every code in every locale.
2. **Island-free client.** A `.astro` form plus an inline `<script>` wiring the vanilla
   `enhanceForm` controller. No React, no hydration directive, and no zod in the browser (its
   `new Function()` JIT breaks a no-`'unsafe-eval'` CSP): the client validates with a
   hand-rolled mirror of the server schema.

Verify with `references/checklists.md` → "Verify: localized form".

## SEO, the switcher and the banner

Read `references/seo.md`: using `t` in pages and components, `fmt` and `pluralIcu`, placing
`LanguageSwitcher` and `MissingTranslationBanner` (headless: classes come from the project),
`<html lang>` with `toIetfTag`, a `SeoHreflangs` component, sitemap, RSS, `llms.txt` and
`robots.txt`. Those SEO pieces are project code the agent writes, using the package's
`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `replaceLocaleInPath` and `toIetfTag`.

## Guardrails

- Ask the A0 (or form) questions before writing code.
- Locale codes are lowercase everywhere: config keys, `locales/` folders, URLs. Only
  `toIetfTag()` upper-cases the region, for `<html lang>` and hreflang.
- The default locale's JSON defines the schema: a key added only to another locale is not typed.
  Add it to the default locale first.
- Generated files are produced by the CLI, never edited by hand.
- Secrets (`.dev.vars`, `.env*`, API tokens) never enter git: run `git check-ignore <file>`
  before writing a secret file, and stage files by name, never with `git add -A`.
- Never import `@edgekits/astro-i18n/runtime` (or `/middleware`) from a module Node loads:
  `astro.config`, `edgekits-i18n.config.ts`, `src/content.config.ts`, unit tests. Use
  `localesOf(config)` from `./config` and the helpers from `./format` there.
- Do not copy engine code into the project. If something the project needs is not exported by
  the package, say so instead of re-implementing it.
