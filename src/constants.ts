import { I18N_CONFIG } from './config'
import type { I18nLanguage, Locale } from './types'

export type { Locale }

export type Language = I18nLanguage

// Languages are configured in the project's edgekits-i18n.config.ts
export const LANGUAGES = I18N_CONFIG.languages as Record<Locale, Language>

// Locales Configuration
export const SUPPORTED_LOCALES = Object.keys(LANGUAGES) as [Locale, ...Locale[]]

// export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'pt-br', 'ja'] as const
export type SupportedLocales = (typeof SUPPORTED_LOCALES)[number]

// Default locale
export const DEFAULT_LOCALE: SupportedLocales = I18N_CONFIG.defaultLocale as Locale

// Missing translation banner flag
export const ENABLE_MISSING_TRANSLATION_BANNER = I18N_CONFIG.missingTranslationBanner

// Cookie name
export const LANG_COOKIE_NAME = I18N_CONFIG.cookie.name
