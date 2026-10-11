import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

/**
 * Boundary guard for the package source: every specifier `src/` reaches for is a
 * dependency the package would have to carry, so only these are allowed.
 *
 * Runtime code (everything outside `src/integration/` and `src/cli/`; it runs in workerd):
 *   - a relative path resolving inside `src/`;
 *   - `astro`, `astro/zod`, `cloudflare:workers`;
 *   - `virtual:@edgekits/astro-i18n/*` (served by the integration's Vite plugin).
 *
 * Build-time code (`src/integration/`, run by Astro while it loads its config, and
 * `src/cli/`, run by the `edgekits-i18n` bin; both run in Node):
 *   - a relative path resolving inside `src/`;
 *   - `astro`, `node:*`, and the packages declared in package.json `dependencies`.
 *
 * Anything else is a violation: any `@/…` specifier (the package has no `@/`), any
 * other bare package (`@tabler/…` included: project UI reaches engine components as
 * props), a relative path escaping `src/`, or a build-time import (`node:*`, a declared
 * dependency) outside `src/integration/` and `src/cli/`.
 *
 * Specifiers are collected from `import … from`, side-effect `import '…'`,
 * `export … from` and `import('…')`, `import type` included. Imports inside an
 * `.astro` client <script> are indented and ship with the package too.
 */

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')

type Edge = { file: string; specifier: string }

const RUNTIME_ALLOWED = new Set(['astro', 'astro/zod', 'cloudflare:workers'])
const VIRTUAL_PREFIX = 'virtual:@edgekits/astro-i18n/'
const BUILD_TIME_DIRS = ['integration/', 'cli/']
const DEPENDENCIES = Object.keys(
  (JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> })
    .dependencies ?? {},
)
const BUILD_TIME_ALLOWED = new Set(['astro', ...DEPENDENCIES])

const isBuildTime = (file: string) => BUILD_TIME_DIRS.some((dir) => file.startsWith(dir))
const CONFIG_ID = `${VIRTUAL_PREFIX}config`

// `[^;]*?` lets a multi-line `import {\n…\n} from '…'` still yield its specifier.
const IMPORT_FROM = /^[ \t]*import\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm
const IMPORT_SIDE_EFFECT = /^[ \t]*import\s*['"]([^'"]+)['"]/gm
const EXPORT_FROM = /^[ \t]*export\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm
const IMPORT_CALL = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(ts|astro)$/.test(entry.name) ? [full] : []
  })
}

function collectEdges(): Edge[] {
  return walk(SRC_DIR).flatMap((full) => {
    const source = readFileSync(full, 'utf8')
    const file = path.relative(SRC_DIR, full).split(path.sep).join('/')
    return [IMPORT_FROM, IMPORT_SIDE_EFFECT, EXPORT_FROM, IMPORT_CALL]
      .flatMap((pattern) => [...source.matchAll(pattern)])
      .map((match) => ({ file, specifier: match[1]! }))
  })
}

function isViolation({ file, specifier }: Edge): boolean {
  if (specifier.startsWith('.')) {
    const resolved = path.resolve(SRC_DIR, path.dirname(file), specifier)
    const rel = path.relative(SRC_DIR, resolved)
    return rel.startsWith('..') || path.isAbsolute(rel)
  }
  if (isBuildTime(file)) {
    return !(BUILD_TIME_ALLOWED.has(specifier) || specifier.startsWith('node:'))
  }
  return !(RUNTIME_ALLOWED.has(specifier) || specifier.startsWith(VIRTUAL_PREFIX))
}

const key = ({ file, specifier }: Edge) => `${file} -> ${specifier}`

test('src/ imports only what its boundary allows', () => {
  const violations = collectEdges().filter(isViolation).map(key)
  assert.deepEqual(violations, [], 'imports outside the package boundary')
})

test('the scanner sees the package (non-vacuous)', () => {
  const edges = collectEdges()
  assert.ok(
    edges.some((e) => e.specifier === 'cloudflare:workers'),
    'runtime bare edge found',
  )
  assert.ok(
    edges.some((e) => e.specifier.startsWith('.')),
    'relative edge found',
  )
  assert.ok(
    edges.some((e) => e.specifier.startsWith(VIRTUAL_PREFIX)),
    'virtual edge found',
  )
  assert.ok(
    edges.some((e) => e.file.startsWith('integration/') && e.specifier.startsWith('node:')),
    'integration node: edge found',
  )
  assert.ok(
    edges.some((e) => e.file.startsWith('cli/') && DEPENDENCIES.includes(e.specifier)),
    'cli dependency edge found',
  )
  assert.ok(DEPENDENCIES.length > 0, 'package.json dependencies read')
  assert.ok(
    edges.some((e) => key(e) === `schema.ts -> ${VIRTUAL_PREFIX}runtime-constants`),
    '`export … from` is scanned',
  )
  // Two frontmatter imports plus the indented one in the client <script>.
  const switcherConstants = edges.filter((e) => key(e) === 'components/LanguageSwitcher.astro -> ../constants')
  assert.equal(switcherConstants.length, 3, '<script> imports are scanned')
})

test('the classifier rejects what the boundary forbids', () => {
  assert.ok(isViolation({ file: 'config.ts', specifier: '@/config' }))
  assert.ok(isViolation({ file: 'fetcher.ts', specifier: '@/domain/i18n/constants' }), 'self-alias')
  assert.ok(isViolation({ file: 'components/LanguageSwitcher.astro', specifier: '@tabler/icons/outline/world.svg' }))
  assert.ok(isViolation({ file: 'middleware/i18n.ts', specifier: '../../security/x' }))
  assert.ok(isViolation({ file: 'fetcher.ts', specifier: 'virtual:other/config' }))
  assert.ok(isViolation({ file: 'integration/index.ts', specifier: 'vite' }))
  assert.ok(isViolation({ file: 'integration/index.ts', specifier: 'cloudflare:workers' }))
  assert.ok(isViolation({ file: 'integration/index.ts', specifier: CONFIG_ID }), 'virtual modules are runtime-only')
  assert.ok(!isViolation({ file: 'middleware/i18n.ts', specifier: '../schema' }))
  assert.ok(!isViolation({ file: 'integration/index.ts', specifier: '../types' }))
  assert.ok(!isViolation({ file: 'schema.ts', specifier: 'astro/zod' }))
  assert.ok(!isViolation({ file: 'fetcher.ts', specifier: `${VIRTUAL_PREFIX}fallbacks` }))
})

test('node: imports and dependencies are allowed in src/integration/ and src/cli/ only', () => {
  assert.ok(!isViolation({ file: 'integration/vite-plugin.ts', specifier: 'node:fs' }))
  assert.ok(!isViolation({ file: 'cli/index.ts', specifier: 'node:child_process' }))
  assert.ok(!isViolation({ file: 'cli/load-config.ts', specifier: 'jiti' }))
  assert.ok(!isViolation({ file: 'cli/wrangler.ts', specifier: 'jsonc-parser' }))
  assert.ok(isViolation({ file: 'cli/index.ts', specifier: 'chalk' }), 'undeclared package')
  assert.ok(
    isViolation({ file: 'cli/index.ts', specifier: `${VIRTUAL_PREFIX}config` }),
    'virtual modules are runtime-only',
  )
  assert.ok(isViolation({ file: 'fetcher.ts', specifier: 'jiti' }))
  assert.ok(isViolation({ file: 'key-format.ts', specifier: 'jsonc-parser' }))
  assert.ok(isViolation({ file: 'fetcher.ts', specifier: 'node:fs' }))
  assert.ok(isViolation({ file: 'middleware/i18n.ts', specifier: 'node:url' }))
  assert.ok(isViolation({ file: 'components/LanguageSwitcher.astro', specifier: 'node:path' }))
  // A path outside src/ that merely looks like the build-time folder gets no exemption.
  assert.ok(isViolation({ file: 'integrations.ts', specifier: 'node:fs' }))
  assert.ok(isViolation({ file: 'clients.ts', specifier: 'node:fs' }))
})

test('config.ts is the only reader of the virtual config', () => {
  const readers = collectEdges()
    .filter((e) => e.specifier === CONFIG_ID)
    .map((e) => e.file)
  assert.deepEqual(readers, ['config.ts'])
})

// A relative VALUE import passes the specifier rules above, yet in a client
// <script> it inlines whatever the module reaches into every page: `../constants`
// → `./config` → the whole project config (RA114–RA115, ADR-0117 in edgekits-site).
// So engine client scripts may import types only. `import { type X }` is a value
// import (the module still loads); dynamic `import(` counts too.
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---/
const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/g
const STATIC_IMPORT = /^[ \t]*import\b[^;]*?['"][^'"]+['"]/gm
const DYNAMIC_IMPORT = /\bimport\s*\(/

test('engine client scripts import types only', () => {
  const offending: string[] = []
  let blocks = 0
  for (const full of walk(SRC_DIR).filter((f) => f.endsWith('.astro'))) {
    const file = path.relative(SRC_DIR, full).split(path.sep).join('/')
    const markup = readFileSync(full, 'utf8').replace(FRONTMATTER, '')
    ;[...markup.matchAll(SCRIPT_BLOCK)].forEach(([, body], index) => {
      blocks++
      for (const [statement] of body!.matchAll(STATIC_IMPORT)) {
        if (!/^\s*import\s+type\s/.test(statement)) offending.push(`${file} <script> #${index}: ${statement.trim()}`)
      }
      for (const line of body!.split('\n').filter((l) => DYNAMIC_IMPORT.test(l))) {
        offending.push(`${file} <script> #${index}: ${line.trim()}`)
      }
    })
  }
  assert.ok(blocks > 0, 'at least one engine <script> block found')
  assert.deepEqual(offending, [], 'value imports in engine client scripts')
})

test('the guard catches a seeded violation (fails when it should)', () => {
  const seeded: Edge[] = [
    { file: 'fetcher.ts', specifier: 'node:fs' },
    { file: 'components/LanguageSwitcher.astro', specifier: '@tabler/icons/filled/point.svg' },
    { file: 'config.ts', specifier: '@/config' },
  ]
  const violations = [...collectEdges(), ...seeded].filter(isViolation).map(key)
  assert.deepEqual(violations, seeded.map(key))
})
