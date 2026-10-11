import type { AstroIntegration } from 'astro'

import { DEFAULT_GENERATED_DIR, defineI18nConfig, type I18nConfig } from '../types.ts'
import { i18nVitePlugin } from './vite-plugin.ts'

export type EdgekitsI18nOptions = {
  // 'auto' registers the i18n middleware; 'manual' leaves it to the project, which
  // then imports `i18nMiddleware` and places it in its own sequence.
  middleware?: 'auto' | 'manual'
}

const MIDDLEWARE_MODES = ['auto', 'manual'] as const

export const PACKAGE_NAME = '@edgekits/astro-i18n'

/**
 * The Astro integration. Build time only: it runs in Node while Astro loads its
 * config, so it reaches the engine's runtime modules through nothing but the Vite
 * plugin's virtual modules.
 */
export function edgekitsI18n(config: I18nConfig, options: EdgekitsI18nOptions = {}): AstroIntegration {
  const i18nConfig = defineI18nConfig(config)
  const middleware = options.middleware ?? 'auto'

  if (!MIDDLEWARE_MODES.includes(middleware)) {
    throw new Error(
      `[@edgekits/astro-i18n] \`middleware\` "${String(middleware)}" is not supported; use 'auto' or 'manual'.`,
    )
  }

  return {
    name: '@edgekits/astro-i18n',
    hooks: {
      'astro:config:setup': ({ config: astroConfig, updateConfig, addMiddleware }) => {
        const generatedDir = new URL(
          `${trimSlashes(i18nConfig.generatedDir ?? DEFAULT_GENERATED_DIR)}/`,
          astroConfig.root,
        )

        updateConfig({
          vite: {
            plugins: [i18nVitePlugin(i18nConfig, generatedDir)],
            // The runtime ships as source and imports the virtual modules above: Vite
            // must process it rather than hand it to Node as an external dependency.
            ssr: { noExternal: [PACKAGE_NAME] },
          },
        })

        if (middleware === 'auto') {
          addMiddleware({ entrypoint: '@edgekits/astro-i18n/middleware', order: 'pre' })
        }
      },
      'astro:config:done': ({ injectTypes }) => {
        injectTypes({ filename: 'locales.d.ts', content: localesDeclaration(Object.keys(i18nConfig.languages)) })
      },
    },
  }
}

// Each entry that exports `I18nLocales` from its own declaration: the root entry's comes
// from dist/types.d.ts, the runtime entry's from the shipped source (src/types.ts).
const LOCALE_MODULES = ['@edgekits/astro-i18n', '@edgekits/astro-i18n/runtime']

/**
 * Augments `I18nLocales` with the configured locales, so `Locale` narrows from
 * `string` to their union in the project, through both entries. The `export {}` keeps
 * the file a module: without it `declare module` would replace the package's types
 * instead of merging.
 */
export function localesDeclaration(locales: readonly string[]): string {
  const members = locales.map((locale) => `    ${JSON.stringify(locale)}: true`)

  return [
    'export {}',
    ...LOCALE_MODULES.flatMap((specifier) => [
      '',
      `declare module '${specifier}' {`,
      '  interface I18nLocales {',
      ...members,
      '  }',
      '}',
    ]),
    '',
  ].join('\n')
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}
