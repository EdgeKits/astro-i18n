# Astro i18n (EdgeKits)

A free agent skill for Claude Code, Cursor, OpenCode and any other coding agent that reads `SKILL.md`. Tell your
agent to make your Astro site multilingual, and it adopts [`@edgekits/astro-i18n`](https://github.com/EdgeKits/astro-i18n):
translations stored as data in Workers KV, a per-namespace edge cache that is purged only where content changed,
and translation keys typed from your default locale's JSON. It asks the few questions only you can answer
(locales, default locale, geo and markdown policy), follows the package README in order, and checks the result.

It also covers what comes after the setup: localized forms the EdgeKits way (validation errors as stable codes,
no client framework and no zod in the browser), and multilingual SEO (`<html lang>`, hreflang, sitemap, RSS,
`llms.txt`, `robots.txt`).

## Install

**Claude Code**, as a plugin:

```
/plugin marketplace add EdgeKits/skills
/plugin install astro-i18n@edgekits
```

**Any other agent**, with the [skills CLI](https://skills.sh):

```
npx skills add EdgeKits/astro-i18n --skill astro-i18n
```

Then, in your Astro project, tell your agent something like "add i18n with German and Spanish", "add a locale",
"localize this form" or "add hreflang tags".

## What it needs

- An Astro project on Cloudflare Workers: Astro `^7.3` with the `@astrojs/cloudflare` adapter `^14.3`.
- The npm package [`@edgekits/astro-i18n`](https://www.npmjs.com/package/@edgekits/astro-i18n). The skill
  installs it; its README is the installation and configuration reference the skill follows.

## Privacy

This plugin collects, stores and sends no data. It contains no code, no hooks and no MCP servers, only
instructions (`SKILL.md`, its reference pages and two starter translation files). The commands it asks your agent
to run (`npm install`, `wrangler`, the package's `edgekits-i18n` CLI) talk to npm and to your own Cloudflare account
under their own terms. EdgeKits runs no service behind this plugin.

## License

MIT, see [LICENSE](../../LICENSE).
