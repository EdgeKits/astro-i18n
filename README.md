# @edgekits/astro-i18n

Edge-native i18n for Astro on Cloudflare Workers. Translations live as data in Workers KV, one
JSON value per locale and namespace, so the server renders every page in its language and
nothing ships to the client; changing a string is a KV write, not a redeploy. Each namespace is
cached at the edge under its own URL, and `edgekits-i18n migrate` purges only the namespaces
whose content changed through the Cloudflare Purge API. The default locale's JSON files define a
typed schema: the CLI generates the `I18n.Schema` declaration, so `t.common.hero.title` is
checked by TypeScript and a missing key is a compile error.

The design is explained in the edgekits.dev series:
[Stop Shipping Translations to the Client, Part 1](https://edgekits.dev/en/blog/edge-native-i18n-astro-cloudflare-part-1/),
[Part 2](https://edgekits.dev/en/blog/edge-native-i18n-astro-cloudflare-part-2/) and
[Stop Redeploying to Update Translations (Part 3)](https://edgekits.dev/en/blog/granular-edge-cache-purge-astro-cloudflare-part-3/).

## Requirements

- Astro `^7.3` with `output: 'server'` and the `@astrojs/cloudflare` adapter `^14.3`.
- wrangler `^4.125`, installed in the project (a peer dependency: the CLI runs the project's own
  wrangler for its KV writes).
- A `wrangler.jsonc` (the CLI reads that file; `wrangler.toml` and `wrangler.json` are not read).
- Node `>=22`.
- A Workers KV namespace bound as `TRANSLATIONS`.
- For `migrate` only: the site on a proxied Cloudflare zone, its zone ID, and an API token with
  the Zone › Cache Purge permission.

## Quick start

### 1. Install

```sh
npm i @edgekits/astro-i18n
```

### 2. Bind a KV namespace

```sh
npx wrangler kv namespace create TRANSLATIONS
```

Add the namespace to `wrangler.jsonc` under the binding name `TRANSLATIONS`:

```jsonc
{
  "compatibility_date": "2026-09-01",
  "kv_namespaces": [{ "binding": "TRANSLATIONS", "id": "<the id wrangler printed>" }],
}
```

### 3. Write `edgekits-i18n.config.ts`

At the project root. Both the integration and the CLI read it.

```ts
// edgekits-i18n.config.ts
import { defineI18nConfig } from '@edgekits/astro-i18n/config'

export default defineI18nConfig({
  // The keys are the locales; the only list of languages there is.
  languages: {
    en: { countryCode: 'us', name: 'English' },
    de: { countryCode: 'de', name: 'Deutsch' },
  },
  defaultLocale: 'en',
  // The language cookie: set by the LanguageSwitcher, kept in sync by the middleware.
  cookie: { name: 'lang', maxAge: 60 * 60 * 24 * 365 },
  // Prefix of every KV key and the host of every edge-cache URL: use your site's domain.
  keyPrefix: 'example.com',
  // Whether MissingTranslationBanner may render.
  missingTranslationBanner: true,
  // Every URL starts with its locale (/en/, /de/about/). The only routing there is.
  routing: 'prefix',
})
```

| Field                      | Required | Default      | Meaning                                                                  |
| -------------------------- | -------- | ------------ | ------------------------------------------------------------------------ |
| `languages`                | yes      |              | `{ [locale]: { countryCode, name } }`; `countryCode` is for your flag UI |
| `defaultLocale`            | yes      |              | one of `languages`; its JSON files define the schema                     |
| `cookie`                   | yes      |              | `{ name, maxAge }` (seconds) of the language cookie                      |
| `keyPrefix`                | yes      |              | KV keys are `<keyPrefix>:<namespace>:<locale>`                           |
| `missingTranslationBanner` | yes      |              | enables `MissingTranslationBanner`                                       |
| `routing`                  | yes      |              | `'prefix'`                                                               |
| `localesDir`               | no       | `'locales'`  | where the CLI reads `<locale>/<namespace>.json`                          |
| `generatedDir`             | no       | `'src/i18n'` | where the CLI writes `runtime-constants.ts` and `fallbacks.generated.ts` |
| `countryToLocale`          | no       | none         | geo-IP step of the locale fallback (see Reference)                       |
| `markdownLocale`           | no       | none         | the locale `.md` endpoints are served in (see Reference)                 |

The config is validated when it loads: an empty `languages`, a `defaultLocale` or
`markdownLocale` outside it, or a bad `countryToLocale` entry throws with a message naming the
field.

### 4. Add the integration

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import { edgekitsI18n } from '@edgekits/astro-i18n'

import i18nConfig from './edgekits-i18n.config'

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [edgekitsI18n(i18nConfig)],
})
```

The integration sets up:

- a Vite plugin serving the config and your generated files to the runtime as virtual modules;
- `vite.ssr.noExternal` for the package, whose runtime ships as source;
- Astro's `i18n` block, when `astro.config` has none: `locales` from `languages`, your
  `defaultLocale`, `routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false }`.
  Astro needs it to compute `preferredLocale` from `Accept-Language`. If you keep your own
  block, its `locales` must include every configured locale and its `defaultLocale` must match,
  or the build stops with a message saying which;
- the `Locale` type: the union of your locales, for the package's exports;
- type declarations for its virtual modules, so `tsc` and `astro check` accept the package's
  runtime source in your program;
- the locale-routing middleware, with `edgekitsI18n(i18nConfig)` or
  `edgekitsI18n(i18nConfig, { middleware: 'auto' })`. With `{ middleware: 'manual' }` nothing is
  registered and you place it in your own `sequence()`:

  ```ts
  // src/middleware.ts
  import { sequence } from 'astro:middleware'
  import { onRequest as i18n } from '@edgekits/astro-i18n/middleware'

  export const onRequest = sequence(i18n, yourOwnMiddleware)
  ```

The middleware redirects a URL without a locale (`/`, `/about/`) to a localized one and sets
`Astro.locals.uiLocale` (the URL's locale) and `Astro.locals.translationLocale` (the locale to
fetch translations for) on every request.

### 5. Write translations

One JSON file per locale and namespace, under `localesDir`:

```
locales/
  en/
    common.json
  de/
    common.json
```

```json
// locales/en/common.json
{ "hero": { "title": "Hello, world" } }
```

```json
// locales/de/common.json
{ "hero": { "title": "Hallo, Welt" } }
```

The default locale's files define the schema: their namespaces and keys are the types. Another
locale may leave keys out; the default locale's text fills the gaps.

### 6. Generate and seed

```sh
npx edgekits-i18n seed
```

| Command                            | Writes                                                                                                              | Then                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `edgekits-i18n bundle`             | `i18n-data.json` (the KV payload), `src/i18n.generated.d.ts` (the schema), `<generatedDir>/runtime-constants.ts`    | nothing else                                                                                           |
| `edgekits-i18n bundle --fallbacks` | the above and `<generatedDir>/fallbacks.generated.ts` (the default locale compiled in, served if KV is unreachable) | nothing else                                                                                           |
| `edgekits-i18n seed`               | the same as `bundle --fallbacks`                                                                                    | pushes every value to local KV (`wrangler kv bulk put --local`)                                        |
| `edgekits-i18n migrate`            | the same as `bundle --fallbacks`                                                                                    | pushes to production KV, purges the changed namespaces' edge-cache entries, writes `.i18n-hashes.json` |

The generated files are ordinary project files: commit them, and run the CLI again after you
edit a JSON file.

`.i18n-hashes.json` holds one content hash per namespace and locale as of the last successful
`migrate`; the next `migrate` purges exactly the entries whose hash changed. Rules:

- Only `migrate` writes it, and only after the purge succeeded (or nothing changed). `seed`
  never touches it: local KV is not production.
- Commit it after every `migrate`. It is the record of what production holds.
- `migrate` refuses to run while the file has uncommitted changes, since a wrong baseline would
  skip purges silently. When that git check cannot run (no `git` on the PATH, or not a git work
  tree), `migrate` warns and proceeds without the purge-baseline check.

`migrate` reads the zone ID from `CLOUDFLARE_ZONE_ID` (a var in `wrangler.jsonc` or the
environment) and the token from `CLOUDFLARE_CACHEPURGE_API_TOKEN` (the environment or
`.dev.vars`). Without either, it still pushes to KV but skips the purge and leaves
`.i18n-hashes.json` alone, so the next run retries.

### 7. Use translations in a page

```astro
---
// src/pages/[lang]/index.astro
import { fetchTranslations } from '@edgekits/astro-i18n/runtime'

const { common } = await fetchTranslations(Astro.locals.translationLocale, ['common'])
---

<h1>{common.hero.title}</h1>
```

`fetchTranslations(locale, namespaces)` returns one object per namespace, typed from the
schema: `common.hero.title` is a `string`, a key that does not exist is a type error. Run
`npx astro dev` and open `/de/`: the heading reads "Hallo, Welt", served from local KV. Before
you edit and re-seed, see `I18N_CACHE` below.

`npx astro check` passes on this setup as is. `tsc` also checks the package's runtime source
when a `.ts` file of yours imports it, and that source reads `cloudflare:workers` and a
`KVNamespace` binding: generate the Workers types once with `npx wrangler types` (it needs the
`compatibility_date` above) and `tsc` passes too.

`@edgekits/astro-i18n/runtime` also exports `fmt` (`{placeholder}` interpolation), `plural` and
`pluralIcu`, the locale constants (`DEFAULT_LOCALE`, `SUPPORTED_LOCALES`, `LANGUAGES`) and the
`Locale` type.

### 8. Runtime switches

Both are optional `vars` in `wrangler.jsonc` (or `.dev.vars` locally), read as `on`/`off`
(`true`/`false` and `1`/`0` work too):

| Var          | Default | Effect                                                          |
| ------------ | ------- | --------------------------------------------------------------- |
| `I18N_CACHE` | `on`    | `off` reads KV on every request and skips the edge cache        |
| `DEBUG_I18N` | `off`   | `on` logs cache hits, misses and KV reads to the Worker console |

While you edit translations locally, put `I18N_CACHE=off` in `.dev.vars`. `astro dev` runs your
Worker with a local Cache API, which keeps the first value it served for each namespace: after
a second `seed` the page still shows the old text. With the cache off, a `seed` shows on the
next request. `.dev.vars` is read when the dev server starts: restart it after you
add the line.

## Reference

### Which entry to import

| Entry                               | Where it runs              | What it holds                                                                                                  |
| ----------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `@edgekits/astro-i18n`              | `astro.config` (Node)      | `edgekitsI18n()` (the integration) and `defineI18nConfig`                                                      |
| `@edgekits/astro-i18n/config`       | anywhere, Node-safe        | `defineI18nConfig`, `localesOf(config)` (`DEFAULT_LOCALE`, `SUPPORTED_LOCALES`, `LANGUAGES`), the types        |
| `@edgekits/astro-i18n/format`       | anywhere, Node-safe        | `fmt`, `plural`, `pluralIcu`, `toIetfTag`, `replaceLocaleInPath`, `getLangFromUrl`                             |
| `@edgekits/astro-i18n/runtime`      | workerd only (pages, APIs) | `fetchTranslations`, the locale constants from the integration's config, locale resolution, the format helpers |
| `@edgekits/astro-i18n/middleware`   | workerd only               | the i18n middleware (`onRequest`); registered for you unless `middleware: 'manual'`                            |
| `@edgekits/astro-i18n/components/*` | `.astro` pages             | `LanguageSwitcher`, `MissingTranslationBanner`                                                                 |

Node-safe entries import nothing from `cloudflare:workers` and no virtual module, so unit tests
under Node and `src/content.config.ts` (evaluated by `astro sync`) can use them. `./runtime` and
`./middleware` need the integration's Vite setup and the Workers runtime.

### Geo-IP locale fallback: `countryToLocale`

When a request's URL has no locale, the middleware picks one in this order: the language
cookie, then Astro's `preferredLocale` (full tag, then its language part), then, only when Astro
reports no preferred locale, the visitor's country (`request.cf.country`) through your
`countryToLocale` table, and finally `defaultLocale`. Astro computes `preferredLocale` by
matching `Accept-Language` against its `i18n.locales`, which the integration sets from your
`languages` unless your `astro.config` has its own `i18n` block.

```ts
// edgekits-i18n.config.ts
export default defineI18nConfig({
  languages: { en: { … }, de: { … }, es: { … }, ja: { … } },
  defaultLocale: 'en',
  // ISO 3166-1 alpha-2 (uppercase) → one of `languages`; checked at config time.
  countryToLocale: { US: 'en', GB: 'en', DE: 'de', AT: 'de', CH: 'de', ES: 'es', MX: 'es', JP: 'ja' },
  // …
})
```

Without `countryToLocale` the geo step is skipped: the package ships no country table of its
own, so a visitor with no cookie and no preferred locale gets `defaultLocale`.

### Markdown endpoints: `markdownLocale`

The middleware leaves paths ending in `.md` (or `.md/`) out of locale routing. With
`markdownLocale` set, it also gives them one canonical form: `/<markdownLocale>/<rest>` with no
trailing slash, reached in a single redirect. A leading locale segment is replaced; any other
leading segment is kept.

```ts
// edgekits-i18n.config.ts
export default defineI18nConfig({
  // …
  markdownLocale: 'en', // one of `languages`; checked at config time
})
```

| Request          | With `markdownLocale: 'en'` | Without `markdownLocale` |
| ---------------- | --------------------------- | ------------------------ |
| `/de/blog/x.md/` | redirect to `/en/blog/x.md` | passed through as is     |
| `/blog/x.md`     | redirect to `/en/blog/x.md` | passed through as is     |
| `/en/blog/x.md`  | served                      | passed through as is     |

Use it when your markdown endpoints exist in one locale only. Without it, the package assumes
nothing about them.

### Styling the components

`LanguageSwitcher` and `MissingTranslationBanner` are headless: they carry structure, behaviour
and `data-*` hooks, and every class comes from you. The package ships no CSS and needs no
Tailwind. Pass classes per element through the `classes` prop; a slot you leave out renders no
`class` attribute at all.

`LanguageSwitcher` slots:

| Slot          | Element                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `root`        | the wrapper `div` inside `<language-switcher>`                           |
| `trigger`     | the toggle `button`                                                      |
| `triggerIcon` | the trigger icon (your `triggerIcon` component or the inline default)    |
| `dropdown`    | the menu `div`                                                           |
| `item`        | each language `button`                                                   |
| `itemActive`  | appended to `item` on the current language                               |
| `itemLabel`   | the `span` holding the flag and the language name                        |
| `activeIcon`  | the current-language marker (your `activeIcon` component or the default) |

`MissingTranslationBanner` has one slot, `root` (the banner `div`).

Hooks rendered whether or not you pass `classes`, for CSS or your own scripts:

| Hook                                                           | Where                              | Meaning                          |
| -------------------------------------------------------------- | ---------------------------------- | -------------------------------- |
| `data-open="true\|false"`                                      | `<language-switcher>`              | the menu is open                 |
| `data-current-lang`, `data-cookie-name`, `data-cookie-max-age` | `<language-switcher>`              | config the client script reads   |
| `data-ls-trigger`                                              | the toggle button                  | also carries `aria-expanded`     |
| `data-ls-dropdown`                                             | the menu                           | `hidden` attribute while closed  |
| `data-ls-item`, `data-lang`                                    | each language button               | `data-lang` is the item's locale |
| `data-active="true"`                                           | the current language's button only | that button is also `disabled`   |
| `data-missing="content\|ui"`                                   | the banner                         | which of your `texts` is showing |

The menu opens and closes through the `hidden` HTML attribute, `data-open` on the element and
`aria-expanded` on the trigger; the script adds or removes no class. The browser's default
`[hidden] { display: none }` hides the menu. A display class on the `dropdown` slot (`flex`,
`grid`, `block`) can override that default, so either leave display alone there or restate it,
as the CSS example below does.

With Tailwind:

```astro
<LanguageSwitcher
  classes={{
    root: 'relative',
    trigger: 'rounded-full p-2 hover:bg-muted',
    triggerIcon: 'size-5',
    dropdown: 'absolute right-8 z-50 -mt-8 w-44 overflow-hidden rounded-lg border bg-card shadow-lg',
    item: 'flex w-44 items-center justify-between px-4 py-2 text-sm hover:bg-muted',
    itemActive: 'bg-background cursor-default',
    itemLabel: 'flex items-center gap-3',
    activeIcon: 'size-6',
  }}
/>
<MissingTranslationBanner texts={bannerTexts} classes={{ root: 'mx-6 mt-6 border px-4 py-2 text-center' }} />
```

With plain CSS on the hooks, no `classes` needed:

```css
language-switcher > div {
  position: relative;
}
[data-ls-dropdown] {
  position: absolute;
  right: 0;
  display: flex;
  flex-direction: column;
}
[data-ls-dropdown][hidden] {
  display: none; /* the UA default, restated because the rule above sets display */
}
[data-ls-item][data-active] {
  font-weight: 600;
}
[data-missing='content'] {
  border-left: 3px solid orange;
}
```

## How it works

A request reaches the middleware, which settles the URL's locale (redirecting when there is
none) and sets `uiLocale` and `translationLocale` on `Astro.locals`. A page asks
`fetchTranslations` for the namespaces it renders. Each namespace is looked up in the Workers
Cache API under `https://<keyPrefix>/…`; the misses are read from KV in one batch, merged over
the compiled default-locale fallbacks, returned, and written back to the cache in the
background. Cached entries live for a year (`s-maxage=31536000, immutable`): `migrate` purges the ones whose content
changed, and leaves the rest warm. If KV cannot be reached, the compiled fallbacks render the
default locale's text instead of an error.

## License

MIT © Gary Stupak. See [LICENSE](LICENSE).
