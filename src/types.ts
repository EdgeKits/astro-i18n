/**
 * Public types of the package and the config validator. Pure: no virtual modules,
 * no `cloudflare:workers`, so the consumer's `astro.config` and the CLI can import it
 * under plain Node.
 */

export type I18nLanguage = { countryCode: string; name: string }

export type I18nConfig = {
  // The only source of truth for languages: the keys are the locales.
  languages: Record<string, I18nLanguage>
  defaultLocale: string
  // The lang cookie the middleware keeps in sync with the URL locale.
  cookie: { name: string; maxAge: number }
  // Prefix of every translation KV key and the host of every edge-cache URL.
  keyPrefix: string
  missingTranslationBanner: boolean
  routing: 'prefix'
  // Where the CLI writes `fallbacks.generated.ts` and `runtime-constants.ts`,
  // relative to the project root.
  generatedDir?: string
  // Where the CLI reads `<locale>/<namespace>.json`, relative to the project root.
  localesDir?: string
}

export const DEFAULT_GENERATED_DIR = 'src/i18n'
export const DEFAULT_LOCALES_DIR = 'locales'

/**
 * Validates and returns the config unchanged. Throws at config time on an empty
 * `languages`, a `defaultLocale` that is not one of its keys, or an unknown `routing`.
 */
export function defineI18nConfig<const C extends I18nConfig>(config: C): C {
  const locales = Object.keys(config.languages ?? {})

  if (locales.length === 0) {
    throw new Error('[@edgekits/astro-i18n] `languages` must define at least one locale.')
  }
  if (!locales.includes(config.defaultLocale)) {
    throw new Error(
      `[@edgekits/astro-i18n] \`defaultLocale\` "${config.defaultLocale}" is not one of \`languages\`: ${locales.join(', ')}.`,
    )
  }
  if (config.routing !== 'prefix') {
    throw new Error(
      `[@edgekits/astro-i18n] \`routing\` "${String(config.routing)}" is not supported; the only routing is 'prefix'.`,
    )
  }

  return config
}

/**
 * The project's locales, as keys. Empty here; the integration augments it from the
 * config's `languages` (`injectTypes` at `astro:config:done`).
 */
export interface I18nLocales {}

type LocaleKey = Extract<keyof I18nLocales, string>

// Falls back to `string` while `I18nLocales` is empty, like `Namespace` over `I18n.Schema`.
export type Locale = [LocaleKey] extends [never] ? string : LocaleKey

/** The Worker bindings the engine reads from `cloudflare:workers`. */
export interface I18nBindings {
  TRANSLATIONS: KVNamespace
  I18N_CACHE?: string
  DEBUG_I18N?: string
}

declare global {
  // Augmented by the consumer's generated `i18n.generated.d.ts`.
  namespace I18n {
    interface Schema {}
  }

  // Set by the i18n middleware on every request.
  namespace App {
    interface Locals {
      uiLocale: Locale
      translationLocale: Locale
      isMissingContent?: boolean
    }
  }
}
