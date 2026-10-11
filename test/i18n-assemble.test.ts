import assert from 'node:assert/strict'
import test from 'node:test'

import { assembleNamespace } from '../src/assemble.ts'
import { FALLBACK_BLOG } from '../src/fallbacks.generated.ts'

/**
 * Guard for the 2026-07-18 `/en/blog/` 500 (colo ORD): a Cache API entry for the
 * `blog` namespace written BEFORE the `pagination` keys existed was returned raw
 * by `fetchTranslations`, so `blog.pagination.previous` was `undefined` and the
 * page threw.
 *
 * These tests pin the quantity the defect actually moves — KEY COMPLETENESS of the
 * value the fetcher hands to pages — not object identity. They exercise the pure
 * assembly seam (`assembleNamespace`), which the cache-HIT branch, the KV/miss
 * branch and `fetchAllFromKV` all route through.
 */

type Dict = Record<string, unknown>

function isPlainObject(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Collect every LEAF key path (dot-separated) reachable in a dictionary. */
function leafKeyPaths(value: unknown, prefix = ''): string[] {
  if (!isPlainObject(value)) return prefix ? [prefix] : []

  return Object.entries(value).flatMap(([key, child]) => leafKeyPaths(child, prefix ? `${prefix}.${key}` : key))
}

/** Read a dot-separated path without throwing on missing intermediate objects. */
function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (isPlainObject(acc) ? acc[key] : undefined), value)
}

/**
 * A pre-schema-change cache entry: a deep copy of the compiled fallback with the
 * whole `pagination` subtree removed, exactly as an entry cached before those keys
 * were added would look.
 */
function staleBlogCacheEntry(): Dict {
  const stale = structuredClone(FALLBACK_BLOG) as Dict
  delete stale.pagination
  return stale
}

test('cache HIT: a stale entry still yields every key path the fallback defines', () => {
  const stale = staleBlogCacheEntry()

  // Precondition: the synthetic entry really is missing the keys that crashed.
  assert.equal(readPath(stale, 'pagination.previous'), undefined, 'fixture should be missing pagination')

  const assembled = assembleNamespace(stale, FALLBACK_BLOG)

  const missing = leafKeyPaths(FALLBACK_BLOG).filter((path) => readPath(assembled, path) === undefined)

  assert.deepEqual(missing, [], `assembled namespace is missing key paths: ${missing.join(', ')}`)
})

test('cache HIT: fresh cached values win over fallback values where both exist', () => {
  const cached = { ...staleBlogCacheEntry(), heading: 'Blog (de)', seo: { title: 'Titel (de)' } }

  const assembled = assembleNamespace(cached, FALLBACK_BLOG) as Dict

  assert.equal(readPath(assembled, 'heading'), 'Blog (de)')
  assert.equal(readPath(assembled, 'seo.title'), 'Titel (de)')
  // Sibling key absent from the cached entry falls back rather than vanishing.
  assert.equal(readPath(assembled, 'seo.description'), FALLBACK_BLOG.seo.description)
  // And the subtree added after the entry was cached is filled in.
  assert.equal(readPath(assembled, 'pagination.previous'), FALLBACK_BLOG.pagination.previous)
})

test('tolerates null/undefined for either argument', () => {
  assert.deepEqual(assembleNamespace(null, null), {})
  assert.deepEqual(assembleNamespace(undefined, undefined), {})
  assert.deepEqual(assembleNamespace(null, FALLBACK_BLOG), FALLBACK_BLOG)
  assert.deepEqual(assembleNamespace({ heading: 'x' }, null), { heading: 'x' })
})
