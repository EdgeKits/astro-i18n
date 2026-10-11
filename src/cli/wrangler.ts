import fs from 'node:fs'
import path from 'node:path'

import { parse as parseJsonc, printParseErrorCode, type ParseError } from 'jsonc-parser'

// ---------------------------------------------------------------------------
// Wrangler config reader
// Parses wrangler.jsonc to extract KV namespace IDs and vars by key.
// Single source of truth — no hardcoded IDs or zone IDs in package.json.
// ---------------------------------------------------------------------------

export const KV_BINDING = 'TRANSLATIONS'

function readWranglerConfig(root: string): Record<string, unknown> {
  const wranglerConfigPath = path.join(root, 'wrangler.jsonc')

  if (!fs.existsSync(wranglerConfigPath)) {
    console.error(`[i18n] wrangler.jsonc not found at ${wranglerConfigPath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(wranglerConfigPath, 'utf8')

  const errors: ParseError[] = []
  const config = parseJsonc(raw, errors, { allowTrailingComma: true })

  if (!config || typeof config !== 'object') {
    console.error('[i18n] Failed to parse wrangler.jsonc — result is empty.')
    for (const err of errors) {
      const snippet = raw.slice(Math.max(0, err.offset - 10), err.offset + 20)
      console.error(`  ${printParseErrorCode(err.error)} at offset ${err.offset}: ...${JSON.stringify(snippet)}...`)
    }
    process.exit(1)
  }

  return config
}

export function getKvNamespaceId(root: string, binding: string): string {
  const config = readWranglerConfig(root)
  const kvNamespaces = config.kv_namespaces as
    | Array<{
        binding: string
        id: string
      }>
    | undefined

  const entry = kvNamespaces?.find((kv) => kv.binding === binding)

  if (!entry) {
    console.error(`[i18n] KV binding "${binding}" not found in wrangler.jsonc`)
    process.exit(1)
  }

  return entry.id
}

export function getWranglerVar(root: string, key: string): string | undefined {
  const config = readWranglerConfig(root)
  const vars = config.vars as Record<string, string> | undefined
  return vars?.[key]
}
