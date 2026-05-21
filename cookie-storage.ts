import { type AstroCookies } from 'astro'

import { LocaleSchema } from './schema'
import type { Locale } from './constants'
import { setCookie, getCookieWithSchema } from '@/utils/server/cookies'
import { LANG_COOKIE_NAME } from './constants'

export function setCookieLang(cookies: AstroCookies, locale: Locale) {
  setCookie(cookies, LANG_COOKIE_NAME, locale)
}

export function getCookieLang(cookies: AstroCookies): Locale | null {
  return getCookieWithSchema(cookies, LANG_COOKIE_NAME, LocaleSchema)
}
