import assert from 'node:assert/strict'
import test from 'node:test'

import { mapCountryToLocale, resolveFallbackLocale, type FallbackInputs } from '../src/locale-fallback.ts'

/**
 * The middleware's fallback cascade: cookie → preferred locale (Astro's Accept-Language
 * match; full, then language part) → geo-IP (only without a preferred locale, only with a
 * table) → default.
 * Each input records whether it was read, to pin that the cascade reads no further
 * than it needs (the getters stand in for request-bound reads).
 */

type Locale = 'en' | 'de' | 'pt'
const LOCALES: readonly Locale[] = ['en', 'de', 'pt']
const TABLE = { DE: 'de', AT: 'de', BR: 'pt' }

function inputs(values: { cookie?: Locale | null; preferred?: string; country?: unknown }) {
  const read: string[] = []
  const getters: FallbackInputs<Locale> = {
    cookieLocale: () => (read.push('cookie'), values.cookie ?? null),
    preferredLocale: () => (read.push('preferred'), values.preferred),
    country: () => (read.push('country'), values.country),
  }
  return { getters, read }
}

const options = (countryToLocale?: Record<string, string>) => ({
  parseLocale: (value: unknown) => (LOCALES.includes(value as Locale) ? (value as Locale) : null),
  defaultLocale: 'en' as Locale,
  countryToLocale,
})

test('1. a valid cookie wins and nothing else is read', () => {
  const { getters, read } = inputs({ cookie: 'de', preferred: 'pt-BR', country: 'BR' })
  assert.equal(resolveFallbackLocale(getters, options(TABLE)), 'de')
  assert.deepEqual(read, ['cookie'])
})

test('2. preferred locale: full tag first, then its language part', () => {
  assert.equal(resolveFallbackLocale(inputs({ preferred: 'de' }).getters, options(TABLE)), 'de')
  const { getters, read } = inputs({ preferred: 'pt-BR', country: 'DE' })
  assert.equal(resolveFallbackLocale(getters, options(TABLE)), 'pt')
  assert.deepEqual(read, ['cookie', 'preferred'], 'geo is not read when the preferred locale matched')
})

test('2b. a preferred locale that does not parse goes to the default, not to geo', () => {
  const { getters, read } = inputs({ preferred: 'fr-FR', country: 'DE' })
  assert.equal(resolveFallbackLocale(getters, options(TABLE)), 'en')
  assert.deepEqual(read, ['cookie', 'preferred'])
})

test('3. without a preferred locale, the geo table maps the country', () => {
  const { getters, read } = inputs({ country: 'AT' })
  assert.equal(resolveFallbackLocale(getters, options(TABLE)), 'de')
  assert.deepEqual(read, ['cookie', 'preferred', 'country'])
  assert.equal(resolveFallbackLocale(inputs({ country: 'br' }).getters, options(TABLE)), 'pt', 'case-insensitive')
})

test('3b. a country missing from the table, or no country, falls to the default', () => {
  assert.equal(resolveFallbackLocale(inputs({ country: 'US' }).getters, options(TABLE)), 'en')
  assert.equal(resolveFallbackLocale(inputs({ country: undefined }).getters, options(TABLE)), 'en')
})

test('3c. without a table the geo step is skipped and the country is never read', () => {
  const { getters, read } = inputs({ country: 'DE' })
  assert.equal(resolveFallbackLocale(getters, options()), 'en')
  assert.deepEqual(read, ['cookie', 'preferred'])
})

test('mapCountryToLocale reads the given table only', () => {
  assert.equal(mapCountryToLocale('de', TABLE), 'de')
  assert.equal(mapCountryToLocale('JP', TABLE), undefined)
  assert.equal(mapCountryToLocale(null, TABLE), undefined)
  assert.equal(mapCountryToLocale('DE', {}), undefined)
})
