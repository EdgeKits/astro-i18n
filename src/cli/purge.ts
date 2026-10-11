// ---------------------------------------------------------------------------
// Cloudflare Cache Purge API
// ---------------------------------------------------------------------------

/**
 * Purge a list of URLs from Cloudflare's edge cache via the Purge API.
 *
 * Handles Cloudflare's rate limits automatically:
 *   - Max 100 URLs per request (max operations per request)
 *   - Max 800 URLs per second on Free plan (8 chunks of 100)
 *
 * Reference: https://developers.cloudflare.com/cache/how-to/purge-cache/
 *
 * @returns true if all chunks succeeded, false if any chunk failed
 */
export async function purgeTranslationsCache(zoneId: string, apiToken: string, urls: string[]): Promise<boolean> {
  if (!urls.length) return true

  // Cloudflare limit: max 100 URLs per single purge request
  const CHUNK_SIZE = 100

  // Cloudflare Free plan limit: 800 URLs/sec = 8 chunks of 100 per second
  // Pro and above: 1500 URLs/sec — CHUNK_SIZE * MAX_CHUNKS_PER_SEC covers Free plan
  const MAX_CHUNKS_PER_SEC = 8

  console.log(`[i18n] Purging cache for ${urls.length} URL(s)...`)

  for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
    const chunk = urls.slice(i, i + CHUNK_SIZE)
    const currentChunkIndex = Math.floor(i / CHUNK_SIZE) + 1

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: chunk }),
      })

      // Rate limit hit — wait and retry the same chunk
      if (response.status === 429) {
        console.warn(`[i18n] [Chunk ${currentChunkIndex}] Rate limit hit, waiting 1000ms before retry...`)
        await sleep(1000)
        i -= CHUNK_SIZE // retry same chunk
        continue
      }

      if (!response.ok) {
        const errorData = await response.text()
        console.error(`[i18n] [Chunk ${currentChunkIndex}] Cloudflare API error:`, errorData)
        return false
      }

      console.log(`[i18n] [Chunk ${currentChunkIndex}] Purged ${chunk.length} URL(s).`)

      // After sending MAX_CHUNKS_PER_SEC chunks (= 800 URLs), pause for 1 second
      // to stay within the Free plan rate limit before the next batch
      if (currentChunkIndex % MAX_CHUNKS_PER_SEC === 0 && i + CHUNK_SIZE < urls.length) {
        console.log(`[i18n] Reached 800 URL/sec limit. Waiting 1000ms before next batch...`)
        await sleep(1000)
      }
    } catch (error) {
      console.error(`[i18n] [Chunk ${currentChunkIndex}] Network error calling Cloudflare API:`, error)
      return false
    }
  }

  return true
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
