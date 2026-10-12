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
- `markdownLocale`: the locale `.md` endpoints are redirected to, as an optional config field; without it they pass through untouched.
- Type declarations for the virtual modules, injected into the consumer's program, so `tsc` and `astro check` accept the runtime source.
- The `astro-i18n` agent skill (a Claude Code plugin, source in `plugins/astro-i18n/`): adopts the package, localizes forms and multilingual SEO; its version tracks the package's.
- Security audit fixes (2026-10-12): locale-negotiated redirects are temporary (302) and uncacheable (`Cache-Control: private, no-store`, `Vary: Cookie, Accept-Language`); the CLI validates locale folders and namespace names and escapes generated string literals; the purge client's HTTP 429 retry is bounded and honours `Retry-After`; hardening of `deepMerge`, the `wrangler` call and KV-failure logging.
