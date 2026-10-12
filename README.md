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

## Styling the components

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
