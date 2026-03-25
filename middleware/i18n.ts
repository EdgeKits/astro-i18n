import type { MiddlewareHandler } from 'astro'
import { LocaleSchema, type Locale } from '../schema'
import { DEFAULT_LOCALE } from '../constants'
import { getCookieLang, setCookieLang } from '../cookie-storage'
import { mapCountryToLocale } from '../country-to-locale-map'
import { resolveLocaleForTranslations } from '../resolve-locale'
import { PROJECT } from '@/config'

// Regex to identify public static assets (images, fonts, scripts, etc.)
// These files should bypass i18n routing and locale detection.
const PUBLIC_FILE_REGEX =
  /\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|map|txt|xml|json|woff2?|avif)$/i

// List of URL prefixes that should be ignored by the i18n middleware.
// Includes API endpoints, internal Astro paths, and standard static routes.
const IGNORED_PREFIXES = [
  '/api',
  '/assets',
  '/_astro',
  '/_image',
  '/_actions',
  '/favicon',
]

// Extracts the context type from Astro's MiddlewareHandler for cleaner function signatures.
type I18nMiddlewareContext = Parameters<MiddlewareHandler>[0]

// Determines if the current request path matches static assets or ignored prefixes.
// Returns true to skip i18n processing for this request.
function shouldBypassI18n(pathname: string): boolean {
  if (PUBLIC_FILE_REGEX.test(pathname)) return true
  if (IGNORED_PREFIXES.some((p) => pathname.startsWith(p))) return true
  return false
}

// Applies strict Content Security Policy (CSP) and other security headers to the response.
// Wrap outgoing responses with this function to ensure consistent security posture.
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

  // Zaraz v3
  // response.headers.set(
  //   'Content-Security-Policy',
  //   `default-src 'self'; ` +
  //     `style-src 'self' 'unsafe-inline'; ` +
  //     // Add 'unsafe-eval' for correct work of Zaraz
  //     `script-src 'self' 'unsafe-inline' 'unsafe-eval' data:; ` +
  //     `connect-src 'self' https://*.google-analytics.com https://stats.g.doubleclick.net https://www.google.com; ` +
  //     `img-src 'self' data: blob: ${PROJECT.cdnUrl} https://*.google-analytics.com https://stats.g.doubleclick.net https://www.google.com; ` +
  //     `font-src 'self' data:; ` +
  //     // Allow media from our CDN
  //     `media-src 'self' ${PROJECT.cdnUrl}; ` +
  //     `frame-ancestors 'self'; ` +
  //     `object-src 'none';`,
  // )

  // Zaraz v5
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; ` +
      // Allow downloading CSS files from Google Fonts
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ` +
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' data:; ` +
      `connect-src 'self' https://*.google-analytics.com https://stats.g.doubleclick.net https://www.google.com; ` +
      `img-src 'self' data: blob: ${PROJECT.cdnUrl} https://*.google-analytics.com https://stats.g.doubleclick.net https://www.google.com; ` +
      // Allow downloading of font files from Google servers.
      `font-src 'self' data: https://fonts.gstatic.com; ` +
      `media-src 'self' ${PROJECT.cdnUrl}; ` +
      `frame-ancestors 'self'; ` +
      `object-src 'none';`,
  )

  return response
}

// Constructs a standardized localized URL path ensuring a trailing slash.
// Example: buildLocalizedPath('en', ['about', 'team']) -> '/en/about/team/'
function buildLocalizedPath(locale: Locale, rest: string[]): string {
  const suffix = rest.join('/')
  return suffix ? `/${locale}/${suffix}/` : `/${locale}/`
}

// Resolves the most appropriate locale for the user based on a fallback cascade:
// 1. User's saved cookie preference.
// 2. Browser's Accept-Language header (matching 2-char code).
// 3. Cloudflare Geo-IP country mapping.
// 4. Finally, falls back to the application's DEFAULT_LOCALE.
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

// Main i18n middleware handler. Intercepts incoming requests, manages routing,
// sets locale context, and handles soft 404 protections for edge environments.
export const i18nMiddleware: MiddlewareHandler = async (context, next) => {
  const url = new URL(context.request.url)
  const pathname = url.pathname

  // 1. Split the URL early to access its segments
  const segments = pathname.split('/').filter(Boolean) // "/es/about/" -> ["es", "about"]
  const firstSegment = segments[0] ?? null

  // 2. SAFETY NET (For static file 404 pages)
  // Attempt to infer the locale from the URL, or fallback to the default.
  let safeLocale = DEFAULT_LOCALE
  if (firstSegment) {
    const parsed = LocaleSchema.safeParse(firstSegment)
    if (parsed.success) {
      safeLocale = parsed.data
    }
  }

  // Inject the locale into the context BEFORE the bypass check!
  context.locals.uiLocale = safeLocale
  context.locals.translationLocale = resolveLocaleForTranslations(safeLocale)

  // 3. Bypass static files and system paths (with Soft 404 protection)
  if (shouldBypassI18n(pathname)) {
    const response = await next()

    const contentType = response.headers.get('content-type') || ''
    const isHtml = contentType.includes('text/html')
    const isRedirect = response.status >= 300 && response.status < 400

    // If Astro attempts to return HTML for a static/API request (and it's not a redirect),
    // it means the file wasn't found and Astro rendered a fallback page (404.astro or catch-all).
    // We strictly intercept this and return a lightweight text-based 404 instead.
    // Why? To mitigate Directory Bruteforcing / Fuzzing attacks and save resources.
    if (isHtml && !isRedirect) {
      // Aggressively save Worker CPU cycles for missing static files
      return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    return response
  }

  const fallbackLocale = resolveFallbackLocale(context)

  // 1. No locale in URL — redirect to fallback locale root
  if (!firstSegment) {
    const target = buildLocalizedPath(fallbackLocale, [])
    if (pathname !== target) {
      // Apply headers to the redirect response
      return applySecurityHeaders(context.redirect(target, 301))
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
      return applySecurityHeaders(context.redirect(normalized, 301))
    }

    return applySecurityHeaders(await next())
  }

  // 3. Invalid locale in URL -> treat the whole path as content missing the locale prefix.
  const target = buildLocalizedPath(fallbackLocale, segments)

  if (pathname !== target) {
    return applySecurityHeaders(context.redirect(target, 301))
  }

  return applySecurityHeaders(await next())
}
