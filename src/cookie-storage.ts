import { type AstroCookies } from 'astro'

import { I18N_CONFIG } from './config'
import { LocaleSchema } from './schema'
import type { Locale } from './constants'
import { LANG_COOKIE_NAME } from './constants'

// Self-contained on purpose: the same options and the same invalid-value warning
// as the project's src/utils/server/cookies.ts, without importing it.
export function setCookieLang(cookies: AstroCookies, locale: Locale) {
  cookies.set(LANG_COOKIE_NAME, locale, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: I18N_CONFIG.cookie.maxAge,
  })
}

export function getCookieLang(cookies: AstroCookies): Locale | null {
  const entry = cookies.get(LANG_COOKIE_NAME)
  if (!entry) return null

  const result = LocaleSchema.safeParse(entry.value)
  if (result.success) return result.data

  if (!import.meta.env.PROD) {
    console.warn(`Invalid cookie "${LANG_COOKIE_NAME}"`, result.error.issues)
  }

  return null
}
