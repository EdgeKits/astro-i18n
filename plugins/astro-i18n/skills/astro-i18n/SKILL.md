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

Before writing any file, ask the questions below that the user's request has not already
answered, in one round, and wait. This holds in every mode, auto and non-interactive included:
the defaults at the end of this section are not substitutes for answers; they apply only when
the user says they do not care. If asking is impossible, stop and print the open questions.

1. Which locales, and which is the default? Codes are lowercase (`pt-br`).
2. Is this an existing Astro + `@astrojs/cloudflare` project? This skill does not scaffold
   Astro: with no project, or no Cloudflare adapter (the package is Workers- and KV-specific),
   say so and stop.
3. Markdown endpoints (`/blog/x.md`, `llms.txt` twins)? In which locale? That is
   `markdownLocale`; without it `.md` paths pass through.
4. Should the visitor's country pick the locale when no cookie or Accept-Language matches?
   Which countries, to which locale? That is `countryToLocale`; without it geo is skipped.
5. Middleware: `auto` (the integration registers it) or `manual` (slotted into the project's
   own `src/middleware.ts` sequence)? Ask if that file exists.
6. Flags in the switcher? A flag is the locale's `countryCode` (ISO 3166-1 alpha-2,
   lowercase): a regional locale takes its region (`pt-br` → `br`); for a language-only one
   propose a country (`en` → `us`, `es` → `es`) for the user to confirm. Show the full list
   back before writing the config. SVGs: `flag-icons` (MIT) or the project's own.

Defaults when the user says they do not care: `missingTranslationBanner: true`, no
`countryToLocale`, no `markdownLocale`, `auto` middleware, flags on by the rule above.

### A1. Install and follow the README in order

`npm i @edgekits/astro-i18n`, then follow these README sections in order:

1. Requirements (versions, `output: 'server'`, `wrangler.jsonc`).
2. Quick start 1–6: Install; Bind a KV namespace; Write `edgekits-i18n.config.ts` (the A0
   answers; no `countryCode` when flags are off); Add the integration; Write translations;
   Generate and seed.
3. Route layout: every page moves under `src/pages/[lang]/`, same path
   (`about.astro` → `[lang]/about.astro`); no root `index.astro` (the middleware redirects
   `/`). Non-localized endpoints (`robots.txt`, `sitemap`, `/api/*`) and `public/` stay at the
   root. Layouts set `<html lang>` from `Astro.locals.uiLocale` via `toIetfTag`. Code:
   `references/seo.md` → Route layout.
4. Quick start 7–8: Use translations in a page; Runtime switches.
5. Reference: Which entry to import; `countryToLocale`; `markdownLocale`; Styling the
   components. Flags on: `references/seo.md` → Flags.

Starter files: copy `assets/locales/common.json` and `messages.json` into `locales/<default>/`
and translate per locale (`messages.json`: banner texts, form error codes).

`wrangler kv namespace create` touches the user's Cloudflare account: ask before running it.
Until then, local dev takes any 32-character hex id (the CLI rejects other shapes).

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
   `enhanceForm` controller, no hydration directive. No zod in the browser (its
   `new Function()` JIT breaks a no-`'unsafe-eval'` CSP): the client validates with a
   hand-rolled mirror of the server schema. This is the default, not a ban: if the user asks
   for React, a form library or any framework, use it, keep errors as codes and zod out of
   the browser.

Verify with `references/checklists.md` → "Verify: localized form".

## SEO, the switcher and the banner

Read `references/seo.md`: using `t` in pages and components, `fmt` and `pluralIcu`, placing
`LanguageSwitcher` and `MissingTranslationBanner` (headless: classes come from the project),
`<html lang>` with `toIetfTag`, a `SeoHreflangs` component, sitemap, RSS, `llms.txt` and
`robots.txt`. Those SEO pieces are project code the agent writes, using the package's
`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `replaceLocaleInPath` and `toIetfTag`.

## Guardrails

- Ask the open A0 (or form) questions before writing code, in every mode; a default never
  stands in for an unanswered question.
- Locale codes are lowercase everywhere: config keys, `locales/` folders, URLs. Only
  `toIetfTag()` upper-cases the region, for `<html lang>` and hreflang.
- The default locale's JSON is the schema: a key only in another locale is not typed; add it
  to the default locale first.
- Generated files are produced by the CLI, never edited by hand.
- Secrets (`.dev.vars`, `.env*`, API tokens) never enter git: run `git check-ignore <file>`
  before writing one; stage files by name, never `git add -A`.
- Never import `@edgekits/astro-i18n/runtime` (or `/middleware`) from a module Node loads:
  `astro.config`, `edgekits-i18n.config.ts`, `src/content.config.ts`, unit tests. Use
  `localesOf(config)` (`./config`) and `./format` there.
- Do not copy engine code into the project; if the package does not export something it needs,
  say so instead of re-implementing it.
