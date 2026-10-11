import type { MiddlewareHandler } from 'astro'
import { LocaleSchema } from '../schema'
import { DEFAULT_LOCALE, type Locale } from '../constants'
import { getCookieLang, setCookieLang } from '../cookie-storage'
import { mapCountryToLocale } from '../country-to-locale-map'
import { resolveLocaleForTranslations } from '../resolve-locale'

// Regex to identify public static assets (images, fonts, scripts, etc.)
// These files should bypass i18n routing and locale detection.
const PUBLIC_FILE_REGEX = /\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|map|txt|xml|json|woff2?|avif|md)$/i

// List of URL prefixes that should be ignored by the i18n middleware.
// Includes API endpoints, internal Astro paths, and standard static routes.
// The Vite dev-server prefixes (/@vite, /@id, /@fs, /src, /node_modules) make
// dev survive `run_worker_first: ["/*"]` being left on: without them every
// dev-module request fell through to the locale logic, got redirected to
// /<locale>/@vite/... and rendered a full 404 page (with its translation
// fetches) per module. Harmless in prod — no real route starts with these.
const IGNORED_PREFIXES = [
  '/api',
  '/assets',
  '/_astro',
  '/_image',
  '/_actions',
  '/favicon',
  '/@vite',
  '/@id',
  '/@fs',
  '/src',
  '/node_modules',
]

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
        return context.redirect(target, REDIRECT_STATUS)
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
      return context.redirect(target, REDIRECT_STATUS)
    }
    return await next()
  }

  // 2. URL has first segment — validate as locale
  const parsed = LocaleSchema.safeParse(firstSegment)
  const urlLocale: Locale | null = parsed.success ? parsed.data : null

  if (urlLocale) {
    // Keep the lang cookie in sync with the URL locale — but ONLY update an
    // EXISTING cookie that differs. Rationale (HTML edge cache, P1/P2):
    //   - The old unconditional set emitted `Set-Cookie` on EVERY localized
    //     response, which made every response uncacheable (the edge cache
    //     refuses anything carrying Set-Cookie).
    //   - Cookie-less requests (first visits, crawlers, every PSI/GTmetrix run)
    //     must produce NO Set-Cookie at all, otherwise lab tests never hit the
    //     cache and the TTFB jitter (P2) stays. So a missing cookie is NOT
    //     created here — the explicit language choice is persisted client-side
    //     by the LanguageSwitcher, and an existing cookie is re-synced below
    //     when the user lands on a different locale by any other means.
    const cookieLocale = getCookieLang(context.cookies)
    if (cookieLocale && cookieLocale !== urlLocale) {
      setCookieLang(context.cookies, urlLocale)
    }
    // Set uiLocale to Astro locals
    context.locals.uiLocale = urlLocale
    // Define and set translationLocale to Astro locals
    const translationLocale = resolveLocaleForTranslations(urlLocale)
    context.locals.translationLocale = translationLocale

    // Normalize trailing slash and structure
    const normalized = buildLocalizedPath(urlLocale, segments.slice(1))
    if (pathname !== normalized) {
      return context.redirect(normalized, REDIRECT_STATUS)
    }

    return await next()
  }

  // 3. Invalid locale in URL -> treat the whole path as content missing the locale prefix.
  const target = buildLocalizedPath(fallbackLocale, segments)

  if (pathname !== target) {
    return context.redirect(target, REDIRECT_STATUS)
  }

  return await next()
}
