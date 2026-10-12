# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses
[Semantic Versioning](https://semver.org/).

## 0.1.0 — unreleased

### Added

- The engine extracted from edgekits.dev into its own package, with its git history.
- An Astro integration that serves the config and the generated files as virtual modules, sets `ssr.noExternal`, registers the middleware, and sets Astro's `i18n` block when the project has none.
- The `Locale` type narrowed to your locales through the augmentable `I18nLocales` interface.
- The `edgekits-i18n` CLI: `bundle`, `seed` and `migrate`, with per-namespace cache purges and the `.i18n-hashes.json` baseline.
- Node-safe entries `./config` and `./format` for code that runs outside workerd.
- Headless `LanguageSwitcher` and `MissingTranslationBanner`: a `classes` prop map and stable `data-*` hooks, no CSS shipped.
- `countryToLocale`, the geo-IP step of the locale fallback, as an optional config field.
