# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses
[Semantic Versioning](https://semver.org/).

## 0.1.4 — 2026-10-14

No runtime changes: the `astro-i18n` skill only, found while building astro-edgekits-core.

### Skill

- Forms: the action example takes `accept: 'form'`, and the enhanced submit sends `FormData`. Without it Astro 7 answers the native no-JS POST with 415 `UNSUPPORTED_MEDIA_TYPE`.
- Forms: an empty field reaches the action as `null`; the server schema gives that type error the `REQUIRED` code, so the no-JS path reports `REQUIRED` instead of zod's untranslated `invalid_type` text. The client mirror reports `REQUIRED` for an empty email too.
- Forms: the no-JS error helpers resolve field codes through the `messages` namespace, as the form-level error does, and never print a raw code.
- Forms: the client email regex is described as a UX approximation; the server's zod is the authority (the old text claimed the two match byte for byte).
- SEO: list pages show every post in every locale, the URL locale's version where one exists and the default locale's otherwise, with a badge on the card and the banner in `content` mode.
- SEO: a fallback post stays 200 with its canonical on the default-locale URL, no robots meta and hreflang for the locales the post exists in; the layout takes a `canonicalOverride`, and the sitemap lists only existing post files.
- The checklists and "Using the skill" cover both.

## 0.1.3 — 2026-10-13

### Fixed

- The `lang` cookie is no longer `httpOnly`. The `LanguageSwitcher` writes it from the browser and the middleware keeps it in sync with the URL; an `httpOnly` copy set by the server could never be overwritten by the switcher, so a stale value disabled it.
- A `lang` cookie that is present but not one of the configured locales (a value left by another site on the same host) is set to the URL's locale on the next request. A request without the cookie still gets no `Set-Cookie`.

### Added

- Lists in translation JSON are typed: an array of strings (or an empty one) is `string[]`, an array of objects is `Array<{…}>` from its first element. An array that mixes kinds of elements stops the CLI with an error naming the key. A locale's list replaces the fallback's whole.

### Changed

- The skill's flags recipe serves the SVGs from `public/flags/` through an `<img>` instead of inlining them.
- The skill treats the island-free form client as the default, not a prohibition: asked for React or a form library, it uses it, with errors as codes and no zod in the browser.
- "Using the skill": `git init` under Prerequisites; Troubleshooting notes for npm 12's `allowScripts` (`esbuild`, `workerd`) and for a `lang` cookie left by another site on the same host.

## 0.1.2 — 2026-10-13

### Fixed

- `package.json` is normalised (`bin` path without `./`, `repository.url` in the `git+https://….git` form), so `npm publish` prints no warnings.
- The build removes `dist/` before compiling, so a deleted source file can no longer ship as a stale `dist/*.js`.

## 0.1.1 — 2026-10-13

### Changed

- `countryCode` in `languages` is optional. `LanguageSwitcher` renders the `flag` component only for a locale that has one; the item then shows the name alone.
- The `astro-i18n` skill asks whether to show flags (each locale's `countryCode`, SVGs from the `flag-icons` package or the project's own) and moves the project's pages under `src/pages/[lang]/` during adoption.

### Added

- "Using the skill": a user guide for the `astro-i18n` skill, the same section in this README and in the plugin's.
- A `prepublishOnly` script that builds `dist/` before `npm publish`.

## 0.1.0 — 2026-10-12

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
- Security audit fixes (2026-10-12): locale-negotiated redirects are temporary (302) and uncacheable (`Cache-Control: private, no-store`, `Vary: Cookie, Accept-Language`); the CLI validates locale folders and namespace names and escapes generated string literals; the purge client's HTTP 429 retry is bounded and honours `Retry-After`; hardening of `deepMerge` and KV-failure logging; the CLI runs the project's own wrangler (now a declared peer dependency, `^4.125.0`) through Node and `git` directly, with no shell on any platform.
