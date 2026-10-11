// The `./config` entry: Node-safe. It imports nothing from workerd and no virtual module,
// so a project's pure modules (unit tests under Node, `src/content.config.ts` evaluated by
// `astro sync`) can derive the locale constants from the config file directly.
// `test/node-safe-entries.test.ts` loads it under plain Node to keep it that way.
import { defineI18nConfig, type I18nConfig, type I18nLanguage } from './types'

export { defineI18nConfig }
export type { I18nBindings, I18nConfig, I18nLanguage, I18nLocales, Locale } from './types'

/** The locale keys of a config's `languages`: a literal union for a literal config. */
export type LocaleOf<C extends I18nConfig> = Extract<keyof C['languages'], string>

export type LocalesOf<C extends I18nConfig> = {
  DEFAULT_LOCALE: LocaleOf<C>
  SUPPORTED_LOCALES: [LocaleOf<C>, ...LocaleOf<C>[]]
  LANGUAGES: Record<LocaleOf<C>, I18nLanguage>
}

/**
 * The locale constants of a config: the one derivation, shared by the runtime
 * (`constants.ts`, over the virtual config) and by project code (over its own
 * `edgekits-i18n.config.ts`, typed by its own keys without the `I18nLocales` augmentation).
 *
 * `defaultLocale` must be one of `languages` at the type level, and is validated at run time.
 */
export function localesOf<const C extends I18nConfig>(config: C & { defaultLocale: LocaleOf<C> }): LocalesOf<C> {
  defineI18nConfig(config)

  return {
    DEFAULT_LOCALE: config.defaultLocale,
    // Object.keys widens to string[]; the keys are the config's own `languages` keys.
    SUPPORTED_LOCALES: Object.keys(config.languages) as [LocaleOf<C>, ...LocaleOf<C>[]],
    LANGUAGES: config.languages as Record<LocaleOf<C>, I18nLanguage>,
  }
}
