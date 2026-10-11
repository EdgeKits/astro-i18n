# @edgekits/astro-i18n

Edge-native i18n for Astro on Cloudflare Workers: translations served from KV and the Cache API, with locale resolution middleware and typed keys.
It is extracted from the engine that runs [edgekits.dev](https://edgekits.dev) and is not published to npm yet.

## Geo-IP locale fallback: `countryToLocale`

When a request's URL has no locale, the middleware picks one in this order: the `lang` cookie,
then Astro's `preferredLocale` (full tag, then its language part), then, only when Astro reports
no preferred locale, the visitor's country (`request.cf.country`) through your `countryToLocale`
table, and finally `defaultLocale`. Astro computes `preferredLocale` by matching `Accept-Language`
against your Astro `i18n.locales`; without an `i18n` block in `astro.config` it is always
undefined, so set `i18n.locales` to your config's `languages` keys.

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

## Which entry to import

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
