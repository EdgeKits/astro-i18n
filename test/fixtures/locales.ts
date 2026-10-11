import type { CollectedData } from '../../src/cli/generate.ts'

// A small collected locale tree, as the CLI reads it from <localesDir>/<locale>/<namespace>.json:
// `en` (the default) has two namespaces, `de` only one, so `de` is not fully translated.
export const LOCALE_TREE: CollectedData = {
  en: {
    common: { title: 'Hello', nav: { home: 'Home' } },
    blog: { heading: 'Blog' },
  },
  de: {
    common: { title: 'Hallo', nav: { home: 'Startseite' } },
  },
}
