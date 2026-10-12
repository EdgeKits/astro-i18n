import assert from 'node:assert/strict'
import test from 'node:test'

import { i18nMiddleware } from '../src/middleware/i18n.ts'

/**
 * Audit 2026-10-12 A02-1: redirects whose target depends on the visitor (cookie,
 * Accept-Language, country) are temporary and uncacheable; deterministic normalisations
 * stay permanent (301 outside `astro dev`; plain Node has no `import.meta.env`, which
 * counts as production). Driven with a small fake context; the fixture config has
 * en/de/es/ja, default en, cookie `lang`.
 */

type Fake = { cookie?: string; preferredLocale?: string; country?: string }

async function run(path: string, fake: Fake = {}): Promise<{ response: Response; nextCalled: boolean }> {
  let nextCalled = false
  const request = new Request(`https://example.com${path}`)
  Object.assign(request, { cf: fake.country ? { country: fake.country } : undefined })

  const context = {
    request,
    url: new URL(request.url),
    locals: {} as Record<string, unknown>,
    preferredLocale: fake.preferredLocale,
    cookies: {
      get: (name: string) => (name === 'lang' && fake.cookie ? { value: fake.cookie } : undefined),
      set: () => {},
    },
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
  }
  const next = async () => {
    nextCalled = true
    return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })
  }

  const response = (await i18nMiddleware(context as never, next as never)) as Response
  return { response, nextCalled }
}

function assertNegotiated(response: Response, location: string): void {
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('Location'), location)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.headers.get('Vary'), 'Cookie, Accept-Language')
}

test('no locale in the URL: 302 to the negotiated locale, not cacheable', async () => {
  assertNegotiated((await run('/', { preferredLocale: 'de' })).response, '/de/')
  assertNegotiated((await run('/', { cookie: 'ja', preferredLocale: 'de' })).response, '/ja/')
  assertNegotiated((await run('/')).response, '/en/')
})

test('an invalid locale in the URL: 302 to the negotiated locale with the path kept, not cacheable', async () => {
  assertNegotiated((await run('/zz/about/', { cookie: 'es' })).response, '/es/zz/about/')
  assertNegotiated((await run('/blog/post', { preferredLocale: 'de-DE' })).response, '/de/blog/post/')
})

test('trailing-slash normalisation stays permanent and carries no negotiation headers', async () => {
  // No cookie: a differing one would make the middleware re-sync it through setCookieLang,
  // which reads `import.meta.env` (absent under plain Node).
  const { response } = await run('/de/about', { preferredLocale: 'en' })
  assert.equal(response.status, 301)
  assert.equal(response.headers.get('Location'), '/de/about/')
  assert.equal(response.headers.get('Vary'), null)
})

test('a canonical localized URL is served, not redirected', async () => {
  const { response, nextCalled } = await run('/de/about/', { preferredLocale: 'en' })
  assert.equal(nextCalled, true)
  assert.equal(response.status, 200)
})
