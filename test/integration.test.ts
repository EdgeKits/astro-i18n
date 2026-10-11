import assert from 'node:assert/strict'
import test from 'node:test'

import { edgekitsI18n, localesDeclaration } from '../src/integration/index.ts'
import config from './fixtures/i18n.config.ts'

type SetupCalls = { updateConfig: any[]; addMiddleware: any[] }

function runSetup(options?: Parameters<typeof edgekitsI18n>[1]): SetupCalls {
  const calls: SetupCalls = { updateConfig: [], addMiddleware: [] }
  const integration = edgekitsI18n(config, options)
  const setup = integration.hooks['astro:config:setup'] as (params: unknown) => void

  setup({
    // Any absolute root; nothing is read from it during setup.
    config: { root: new URL('./', import.meta.url) },
    updateConfig: (payload: unknown) => calls.updateConfig.push(payload),
    addMiddleware: (payload: unknown) => calls.addMiddleware.push(payload),
  })

  return calls
}

test('updateConfig carries the Vite plugin and ssr.noExternal for the package', () => {
  const { updateConfig } = runSetup()
  assert.equal(updateConfig.length, 1)

  const { vite } = updateConfig[0]
  assert.deepEqual(vite.ssr, { noExternal: ['@edgekits/astro-i18n'] })
  assert.equal(vite.plugins.length, 1)
  assert.equal(vite.plugins[0].name, '@edgekits/astro-i18n')
})

test("middleware: 'auto' (default) registers the entrypoint, 'manual' does not", () => {
  assert.deepEqual(runSetup().addMiddleware, [{ entrypoint: '@edgekits/astro-i18n/middleware', order: 'pre' }])
  assert.deepEqual(runSetup({ middleware: 'manual' }).addMiddleware, [])
  assert.throws(() => edgekitsI18n(config, { middleware: 'sometimes' as never }), /`middleware` "sometimes"/)
})

// Both entries: the root's `I18nLocales` is declared in dist/, the runtime's in src/.
// Augmenting only the root left `Locale` from `/runtime` as `string` in a consumer.
test('injected locale types augment I18nLocales in both entries and stay a module', () => {
  assert.equal(
    localesDeclaration(['en', 'pt-br']),
    [
      'export {}',
      '',
      "declare module '@edgekits/astro-i18n' {",
      '  interface I18nLocales {',
      '    "en": true',
      '    "pt-br": true',
      '  }',
      '}',
      '',
      "declare module '@edgekits/astro-i18n/runtime' {",
      '  interface I18nLocales {',
      '    "en": true',
      '    "pt-br": true',
      '  }',
      '}',
      '',
    ].join('\n'),
  )
})
