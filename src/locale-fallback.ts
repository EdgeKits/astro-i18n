/**
 * The middleware's fallback cascade for a request whose URL carries no valid locale,
 * as a pure function: the request-bound inputs arrive as getters, so each one is read
 * exactly when, and only if, the cascade reaches it (same split as `env` in the fetcher).
 *
 * Order (unchanged from the middleware):
 *   1. the lang cookie, if valid;
 *   2. the preferred locale (the middleware passes Astro's `preferredLocale`: its match of
 *      Accept-Language against the project's Astro `i18n.locales`, undefined when nothing
 *      matches or `i18n` is not configured), full match, then its language part
 *      ('pt-br' -> 'pt');
 *   3. ONLY when there is no preferred locale at all: the Cloudflare geo-IP country,
 *      through the project's `countryToLocale` table (skipped without one);
 *   4. the default locale.
 * A preferred locale that does not parse goes straight to 4: geo is not consulted.
 */

export type FallbackInputs<L extends string> = {
  cookieLocale: () => L | null
  preferredLocale: () => string | undefined
  country: () => unknown
}

export type FallbackOptions<L extends string> = {
  // Returns the locale when the value is a supported one, otherwise null.
  parseLocale: (value: unknown) => L | null
  defaultLocale: L
  countryToLocale?: Readonly<Record<string, string>>
}

export function resolveFallbackLocale<L extends string>(inputs: FallbackInputs<L>, options: FallbackOptions<L>): L {
  const cookieLocale = inputs.cookieLocale()
  if (cookieLocale) return cookieLocale

  const browserRaw = inputs.preferredLocale()
  if (browserRaw) {
    // Currently we support 2-chars locales only.
    // 1) Try full match (for cases where you actually have 'pt-br' in SUPPORTED_LOCALES)
    const full = options.parseLocale(browserRaw)
    if (full) return full

    // 2) Fallback: language part only, e.g. 'pt-br' -> 'pt'
    const short = options.parseLocale(browserRaw.split('-')[0])
    if (short) return short
  } else if (options.countryToLocale) {
    // 3) Cloudflare Geo-IP Strategy
    // cf is undefined in local dev unless simulated
    const geo = options.parseLocale(mapCountryToLocale(inputs.country(), options.countryToLocale))
    if (geo) return geo
  }

  return options.defaultLocale
}

/**
 * Maps a Cloudflare country code (`request.cf.country`) to a locale through the
 * project's table. Returns undefined if the country is not in it.
 */
export function mapCountryToLocale(country: unknown, table: Readonly<Record<string, string>>): string | undefined {
  // Safety: In dev mode (localhost), 'country' might be null or undefined.
  if (typeof country !== 'string') return undefined

  // Cloudflare always sends uppercase (e.g., 'US', 'DE'), but safety first.
  return table[country.toUpperCase()]
}
