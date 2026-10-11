import { COOKIE_TTL, PROJECT } from '@/config'

/**
 * The project values the i18n engine uses, in one place.
 *
 * Contract: this is the ONLY file in `src/domain/i18n/` that may import from the
 * project (`test/i18n-boundary.test.ts` enforces it, for `@/config` alone). In the
 * package, this object is replaced by the integration's options. The rest of the
 * engine reads these values through `constants.ts` and `translations-keys.ts`.
 */
export const I18N_CONFIG = {
  // Prefix of every translation KV key and the host of every edge-cache URL.
  keyPrefix: PROJECT.id,
  // The only source of truth - add new languages here
  languages: {
    en: { countryCode: 'us', name: 'English (US)' },
    de: { countryCode: 'de', name: 'Deutsch' },
    es: { countryCode: 'es', name: 'Español' },
    ja: { countryCode: 'jp', name: '日本語' },
  },
  defaultLocale: 'en',
  // The lang cookie the middleware keeps in sync with the URL locale.
  cookie: { name: 'lang', maxAge: COOKIE_TTL.oneYear },
  missingTranslationBanner: true,
} as const
