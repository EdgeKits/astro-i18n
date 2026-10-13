# Checklists and recipes

Use these to verify work and to handle the common follow-up requests. Commands assume the
package is installed; `npx edgekits-i18n --help` lists the CLI.

---

## Verify: adoption (Workflow A)

- [ ] `edgekits-i18n.config.ts` at the project root: `languages` and `defaultLocale` are what
      the user asked for; `markdownLocale`, `countryToLocale` and the middleware mode match the
      A0 answers.
- [ ] Every locale code is **lowercase**, in the config and in the `locales/*` folder names.
- [ ] Route layout: every page is under `src/pages/[lang]/`; nothing is left at
      `src/pages/*.astro`, and only non-localized endpoints (`robots.txt`, `sitemap.xml`,
      `/api/*`) remain at the root. No layout hard-codes `<html lang>`.
- [ ] Flags: every configured `countryCode` has its SVG in `src/assets/icons/flags/` and the
      switcher gets `flag={Flag}`; or flags are off (no `flag` prop, `countryCode` omitted).
- [ ] `locales/<defaultLocale>/` has at least `common.json` (it defines the schema).
- [ ] `astro.config` has `output: 'server'`, the Cloudflare adapter, and
      `edgekitsI18n(i18nConfig)` in `integrations`. With `{ middleware: 'manual' }`,
      `src/middleware.ts` puts `onRequest` from `@edgekits/astro-i18n/middleware` in its
      `sequence(...)`. An `i18n` block of the project's own covers every configured locale and
      the same default (the build stops otherwise); without one, the integration sets it.
- [ ] `wrangler.jsonc` has the `TRANSLATIONS` KV binding and a `compatibility_date`.
- [ ] `npx edgekits-i18n seed` runs without error and writes `i18n-data.json`,
      `src/i18n.generated.d.ts`, `<generatedDir>/runtime-constants.ts` and
      `<generatedDir>/fallbacks.generated.ts`. `.i18n-hashes.json` is untouched.
- [ ] `.dev.vars` has `I18N_CACHE=off` while translations are being edited locally (the local
      Cache API keeps the first value it served).
- [ ] `npx wrangler types` after any `wrangler.jsonc` / `.dev.vars` change.
- [ ] `npx astro check` passes; `tsc --noEmit` too if the project runs it.
- [ ] `npx astro dev`, then:
  - [ ] `/` redirects to `/<locale>/` (cookie, then `Accept-Language`, then geo, then default);
  - [ ] `/<default>/` renders its copy; `/<other>/` renders its own, or default-locale copy if
        that locale has no JSON yet;
  - [ ] an unsupported first segment (`/zz/`) is treated as content and prefixed, not crashed;
  - [ ] with `markdownLocale`, `/<other>/x.md` redirects once to `/<markdownLocale>/x.md`;
  - [ ] `<html lang>` is IETF-cased (`pt-BR`); hreflang tags exist for every locale plus
        `x-default`.
- [ ] The `LanguageSwitcher` changes the URL's locale segment and sets the language cookie; the
      dropdown hides again (if it never hides, a display class on the `dropdown` slot overrides
      `[hidden]`).

## Verify: production (before and after the first `migrate`)

- [ ] A real KV namespace (`npx wrangler kv namespace create TRANSLATIONS`); its id is the
      `TRANSLATIONS` binding in `wrangler.jsonc`.
- [ ] `CLOUDFLARE_ZONE_ID` in `wrangler.jsonc` vars (or the environment); the domain is
      **proxied** (orange cloud); `keyPrefix` is the site's domain.
- [ ] `CLOUDFLARE_CACHEPURGE_API_TOKEN` (Zone › Cache Purge) in the environment or `.dev.vars`;
      confirm `.dev.vars` is in `.gitignore` first (`git check-ignore .dev.vars`). Never commit
      it, never print it, never pass it on a command line.
- [ ] The Worker deployed at least once.
- [ ] `npx edgekits-i18n migrate` pushes to production KV and purges only the changed namespaces
      (its log lists them).
- [ ] `.i18n-hashes.json` committed right after every successful `migrate`; `migrate` refuses
      to run while it has uncommitted changes.

## Verify: localized form (Workflow B)

- [ ] Every code in `error-codes.ts` (and `common-codes.ts`) has a matching key under
      `errors.ui` / `errors.server` / `common` in **every** locale's `messages.json`.
- [ ] The server zod schema uses CODES as `message` (no human text); the **client** schema is
      a hand-rolled `ClientSchema` mirror (`client-schema.ts` helpers) with the same fields and
      CODES. **No zod, drizzle or server-only import in any `<script>`** (zod's `new Function()`
      JIT breaks a no-`'unsafe-eval'` CSP and bloats the bundle).
- [ ] The action throws `ActionError({ message: CODE, code: 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR' })`.
- [ ] The form is **island-free**: a `.astro` with `<form method="POST" action={actions.x}>` and
      an inline `<script>` calling `enhanceForm(form, clientSchema, action, { tErrors, … })`.
      No React, react-hook-form or shadcn.
- [ ] Markup contract: each field wrapped in `[data-slot="field"]` with a `name`; one
      `[data-error-for="<field>"]` slot per field and one `[data-error-for="_form"]`.
- [ ] Codes map through `resolveFieldMessages(codes, t.messages.errors.ui)`.
- [ ] The page fetches `['<form-namespace>', 'messages']` and passes typed `t` and `uiLocale`
      (hidden input); a plain component include, **no `client:*` directive**.
- [ ] Manual test in two locales, **with and without JS**: happy path; each validation error
      renders **localized** text; a forced server error renders the localized server message
      (toast or `_form` slot). Without JS: native POST, and `Astro.getActionResult` shows the
      result and inline errors.
- [ ] `npx astro check` passes (`t` typed as `Pick<I18n.Schema, …>`); no `react` or `client:`
      ships for the form.

---

## Recipe: add a locale

1. Add it to `languages` in `edgekits-i18n.config.ts` (lowercase key, `name`, and
   `countryCode` when flags are on: copy its SVG too, see `seo.md` → Flags). If `astro.config`
   has its own `i18n` block, add it to `i18n.locales` too.
2. Optionally create `locales/<new>/` and translate. A locale without JSON is still routable:
   `translationLocale` falls back to the default locale, so the UI shows default copy and the
   missing-translation banner says so.
3. `npx edgekits-i18n seed`, then restart `npx astro dev` (the config is read at startup).
4. Check `/<new>/`.
5. Production: `npx edgekits-i18n migrate`, commit `.i18n-hashes.json`, deploy (the config
   change is code).

## Recipe: add a namespace

1. Create `locales/<defaultLocale>/<namespace>.json` (this types it), then the same file in
   each other locale.
2. `npx edgekits-i18n seed` (or `bundle` for types only): the namespace is discovered and typed.
3. Use it: `const { <namespace> } = await fetchTranslations(translationLocale, ['<namespace>'])`.

## Recipe: edit copy in production

1. Edit `locales/<locale>/<namespace>.json`.
2. `npx edgekits-i18n migrate`: pushes to KV and purges only the changed `locale:namespace`
   entries. No deploy needed. Commit `.i18n-hashes.json`.

---

## Common pitfalls

- **A key isn't typed**: it exists only in a non-default locale. Add it to the default locale
  first, then run `bundle` or `seed`.
- **Translations don't update in dev**: the local Cache API serves the first value. Put
  `I18N_CACHE=off` in `.dev.vars`, restart the dev server, re-run `seed`.
- **`t` is untyped on a fresh clone**: `src/i18n.generated.d.ts` was not committed, or the CLI
  never ran. Run `npx edgekits-i18n bundle` and commit the generated files.
- **`Cannot find module 'cloudflare:workers'` / `KVNamespace` in `tsc`**: run `npx wrangler types`.
- **A Node-loaded module fails to import `@edgekits/astro-i18n/runtime`**: that entry is
  workerd-only. Use `localesOf(i18nConfig)` from `./config` and the helpers from `./format`.
- **Mixed-case locale (`pt-BR`) in a URL or folder**: use lowercase (`pt-br`); only
  `toIetfTag()` upper-cases the region, for `<html lang>` and hreflang.
- **`migrate` updated KV but the site shows old copy**: the purge was skipped (zone not
  proxied, zone ID or token missing). KV is updated either way; fix the setting and run
  `migrate` again: `.i18n-hashes.json` was not written, so it retries the same purge.
