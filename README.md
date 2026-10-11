# @edgekits/astro-i18n

Edge-native i18n for Astro on Cloudflare Workers: translations served from KV and the Cache API, with locale resolution middleware and typed keys.
It is extracted from the engine that runs [edgekits.dev](https://edgekits.dev) and is not published to npm yet.

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
