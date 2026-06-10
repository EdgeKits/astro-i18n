import type { MiddlewareHandler } from 'astro'
import { LocaleSchema } from '../schema'
import { DEFAULT_LOCALE, type Locale } from '../constants'
import { getCookieLang, setCookieLang } from '../cookie-storage'
import { mapCountryToLocale } from '../country-to-locale-map'
import { resolveLocaleForTranslations } from '../resolve-locale'
import { PROJECT } from '@/config'

// Regex to identify public static assets (images, fonts, scripts, etc.)
// These files should bypass i18n routing and locale detection.
const PUBLIC_FILE_REGEX = /\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|map|txt|xml|json|woff2?|avif|md)$/i

// List of URL prefixes that should be ignored by the i18n middleware.
// Includes API endpoints, internal Astro paths, and standard static routes.
const IGNORED_PREFIXES = ['/api', '/assets', '/_astro', '/_image', '/_actions', '/favicon']

// Extracts the context type from Astro's MiddlewareHandler for cleaner function signatures.
type I18nMiddlewareContext = Parameters<MiddlewareHandler>[0]

// Redirect status code: 302 (temporary) on the local dev server so nothing gets
// cached while testing, 301 (permanent) in production for correct SEO. Every
// redirect below uses this. NEVER ship 302 to prod — permanent redirects are what
// consolidate canonical signals in Google. `import.meta.env.DEV` is true only under
// `astro dev`; any production build (incl. `astro preview` / `wrangler dev`) -> 301.
const REDIRECT_STATUS = import.meta.env.DEV ? 302 : 301

// Determines if the current request path matches static assets or ignored prefixes.
// Returns true to skip i18n processing for this request.
function shouldBypassI18n(pathname: string): boolean {
  if (PUBLIC_FILE_REGEX.test(pathname)) return true
  if (IGNORED_PREFIXES.some((p) => pathname.startsWith(p))) return true
  // Markdown endpoints: /en/blog/slug.md/ (with or without trailing slash)
  if (/\.md\/?$/.test(pathname)) return true
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

  // // Zaraz v2
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

  // Zaraz v4 — fully same-origin.
  // Zaraz GA4 runs server-side: the browser only talks to /cdn-cgi/zaraz/* on our
  // own origin (verified in DevTools 2026-06-10: zero requests to google-analytics/
  // doubleclick/google.com after disabling "Google Analytics Audiences" in the GA4
  // tool). Google origins removed from connect-src/img-src accordingly.
  // 'unsafe-eval' and data: dropped from script-src: Zaraz removed its eval
  // dependency in 2024 (changelog 2024-07-23 "CSP Compliance: Remove eval
  // dependency"), and data: URIs in script-src are an XSS vector.
  // NOTE: smoke-test after deploy: (1) newsletter subscribe -> segmentation step,
  // (2) zaraz events in /cdn-cgi/zaraz/t, (3) mermaid diagrams on the three blog
  // posts that use them. If mermaid breaks, re-add 'unsafe-eval' ONLY.
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; ` +
      `style-src 'self' 'unsafe-inline'; ` +
      `script-src 'self' 'unsafe-inline'; ` +
      `connect-src 'self'; ` +
      `img-src 'self' data: blob: ${PROJECT.cdnUrl}; ` +
      `font-src 'self' data:; ` +
      // Allow media from our CDN
      `media-src 'self' ${PROJECT.cdnUrl}; ` +
      `frame-ancestors 'self'; ` +
      `object-src 'none';`,
  )

  return response
}

// --- TEMPORARY DIAGNOSTIC ---------------------------------------------------
// Logs every redirect this middleware emits, so we can see whether a *valid*
// deep URL (e.g. /en/blog/slug/) is ever bounced — and from exactly which branch.
// If you reproduce the "homepage on first hit" bug and NO line is logged for the
// requested URL, the redirect is NOT coming from this middleware (look at the
// adapter/router or the edge cache instead). Output appears in the `astro preview`
// / `wrangler dev` terminal. Flip LOG_REDIRECTS to false (or delete this block plus
// the logRedirect() calls) once the bug is diagnosed.
const LOG_REDIRECTS = false
function logRedirect(from: string, to: string, status: number, reason: string): void {
  if (!LOG_REDIRECTS) return
  console.log(`[i18n-redirect] ${status} (${reason}) ${from} -> ${to}`)
}
// ---------------------------------------------------------------------------

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
    const country = context.request?.cf?.country
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
    // Normalize .md endpoints in ONE pass: English-only, no trailing slash.
    // We build the canonical target and redirect once if it differs.
    //
    // Why the rewrite: the old code assumed segments[0] was always a locale and
    // stripped it on `firstSegment !== 'en'` without validating it. That broke any
    // .md whose first segment is NOT a locale — e.g. `/foo.md` collapsed to `/en/`
    // (the homepage!) and `/blog/x.md` lost the `blog` segment. It also fired two
    // chained redirects for `/de/blog/x.md/` (strip slash, then force locale).
    if (/\.md\/?$/.test(pathname)) {
      // Only strip the first segment when it is a REAL locale; otherwise keep the
      // whole path and just prefix /en/. `segments` already excludes the trailing
      // slash (filter(Boolean)), so this also normalizes trailing slashes for free.
      const localeParsed = LocaleSchema.safeParse(firstSegment)
      const contentSegments = localeParsed.success ? segments.slice(1) : segments
      const target = `/en/${contentSegments.join('/')}`

      if (pathname !== target) {
        logRedirect(pathname, target, REDIRECT_STATUS, 'md:normalize')
        return applySecurityHeaders(context.redirect(target, REDIRECT_STATUS))
      }
    }

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
      logRedirect(pathname, target, REDIRECT_STATUS, 'no-locale:root')
      return applySecurityHeaders(context.redirect(target, REDIRECT_STATUS))
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
      logRedirect(pathname, normalized, REDIRECT_STATUS, 'locale-valid:normalize')
      return applySecurityHeaders(context.redirect(normalized, REDIRECT_STATUS))
    }

    return applySecurityHeaders(await next())
  }

  // 3. Invalid locale in URL -> treat the whole path as content missing the locale prefix.
  const target = buildLocalizedPath(fallbackLocale, segments)

  if (pathname !== target) {
    logRedirect(pathname, target, REDIRECT_STATUS, 'invalid-locale:prefix-fallback')
    return applySecurityHeaders(context.redirect(target, REDIRECT_STATUS))
  }

  return applySecurityHeaders(await next())
}
