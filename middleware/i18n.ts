import type { MiddlewareHandler } from 'astro'
import { LocaleSchema, type Locale } from '../schema'
import { DEFAULT_LOCALE } from '../constants'
import { getCookieLang, setCookieLang } from '../cookie-storage'
import { mapCountryToLocale } from '../country-to-locale-map'
import { resolveLocaleForTranslations } from '../resolve-locale'
import { PROJECT } from '@/config'

const PUBLIC_FILE_REGEX =
  /\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|map|txt|xml|json|woff2?|avif)$/i

const IGNORED_PREFIXES = [
  '/api',
  '/assets',
  '/_astro',
  '/_image',
  '/_actions',
  '/favicon',
  '/robots.txt',
]

type I18nMiddlewareContext = Parameters<MiddlewareHandler>[0]

function shouldBypassI18n(pathname: string): boolean {
  if (PUBLIC_FILE_REGEX.test(pathname)) return true
  if (IGNORED_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return false
}

function applySecurityHeaders(response: Response): Response {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // response.headers.set(
  //   'Content-Security-Policy',
  //   `default-src 'self'; ` +
  //     `style-src 'self' 'unsafe-inline'; ` +
  //     // Разрешаем скрипты аналитики
  //     `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://www.googletagmanager.com https://www.google-analytics.com; ` +
  //     // Разрешаем отправку данных (beacons) в Google
  //     `connect-src 'self' https://www.google-analytics.com; ` +
  //     // Разрешаем картинки с нашего CDN, data/blob и пиксели Google
  //     `img-src 'self' data: blob: ${PROJECT.cdnUrl} https://www.google-analytics.com; ` +
  //     `font-src 'self' data:; ` +
  //     // Allowing audio/video downloads from CDN
  //     `media-src 'self' ${PROJECT.cdnUrl}; ` +
  //     `frame-ancestors 'self'; ` +
  //     `object-src 'none';`,
  // )

  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; ` +
      `style-src 'self' 'unsafe-inline'; ` +
      // Added data: for ClientRouter
      `script-src 'self' 'unsafe-inline' data: https://www.googletagmanager.com https://www.google-analytics.com; ` +
      `connect-src 'self' https://www.google-analytics.com; ` +
      `img-src 'self' data: blob: ${PROJECT.cdnUrl} https://www.google-analytics.com; ` +
      `font-src 'self' data:; ` +
      `media-src 'self' ${PROJECT.cdnUrl}; ` +
      `frame-ancestors 'self'; ` +
      `object-src 'none';`,
  )

  return response
}

function buildLocalizedPath(locale: Locale, rest: string[]): string {
  const suffix = rest.join('/')
  return suffix ? `/${locale}/${suffix}/` : `/${locale}/`
}

function resolveFallbackLocale(context: I18nMiddlewareContext): Locale {
  const cookieLocale = getCookieLang(context.cookies)
  if (cookieLocale) return cookieLocale

  const browserRaw = context.preferredLocale
  if (browserRaw) {
    // Currently we support 2-chars locales only.
    // 1) Try full match (for cases where you actually have 'pt-br' in SUPPORTED_LOCALES)
    let parsed = LocaleSchema.safeParse(browserRaw)
    if (parsed.success) return parsed.data

    // 2) Fallback: language part only, e.g. 'pt-br' -> 'pt'
    const short = browserRaw.split('-')[0]
    parsed = LocaleSchema.safeParse(short)
    if (parsed.success) return parsed.data
  } else {
    // 3) Cloudflare Geo-IP Strategy
    // cf is undefined in local dev unless simulated
    const country = context.locals.runtime?.cf?.country
    const geoLocale = mapCountryToLocale(country)
    let parsed = LocaleSchema.safeParse(geoLocale)
    if (parsed.success) return parsed.data
  }

  return DEFAULT_LOCALE
}

export const i18nMiddleware: MiddlewareHandler = async (context, next) => {
  const url = new URL(context.request.url)
  const pathname = url.pathname

  // 0. Skip static / system paths
  if (shouldBypassI18n(pathname)) {
    return next()
  }

  const segments = pathname.split('/').filter(Boolean) // "/es/about/" -> ["es", "about"]
  const firstSegment = segments[0] ?? null

  const fallbackLocale = resolveFallbackLocale(context)

  // 1. No locale in URL — redirect to fallback locale root
  if (!firstSegment) {
    const target = buildLocalizedPath(fallbackLocale, [])
    if (pathname !== target) {
      // Apply headers to the redirect response
      return applySecurityHeaders(context.redirect(target, 302))
    }
    return applySecurityHeaders(await next())
  }

  // 2. URL has first segment — validate as locale
  const parsed = LocaleSchema.safeParse(firstSegment)
  const urlLocale: Locale | null = parsed.success ? parsed.data : null

  if (urlLocale) {
    // Keep cookie in sync with URL locale
    setCookieLang(context.cookies, urlLocale)
    // Set uiLocale to Astro locals
    context.locals.uiLocale = urlLocale
    // Define and set translationLocale to Astro locals
    const translationLocale = resolveLocaleForTranslations(urlLocale)
    context.locals.translationLocale = translationLocale

    // Normalize trailing slash and structure
    const normalized = buildLocalizedPath(urlLocale, segments.slice(1))
    if (pathname !== normalized) {
      return applySecurityHeaders(context.redirect(normalized, 302))
    }

    return applySecurityHeaders(await next())
  }

  // 3. Invalid locale in URL -> treat the whole path as content missing the locale prefix.
  const target = buildLocalizedPath(fallbackLocale, segments)

  if (pathname !== target) {
    return applySecurityHeaders(context.redirect(target, 302))
  }

  return applySecurityHeaders(await next())
}
