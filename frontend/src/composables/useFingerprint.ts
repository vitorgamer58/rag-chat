import Cookies from 'js-cookie'
import FingerprintJS from '@fingerprintjs/fingerprintjs'

const COOKIE_NAME = 'rc_fp'
const COOKIE_EXPIRY_DAYS = 365

// Module-level cache: the fingerprint never changes during a session, so every caller shares the same
// in-flight/resolved promise instead of recomputing it (FingerprintJS's own agent load isn't free).
let cached: Promise<string> | null = null

/**
 * Resolves the visitor fingerprint used to identify this user to the backend (as the `X-Fingerprint`
 * header, or as a `?fingerprint=` query param on the SSE endpoint, which `EventSource` cannot set headers
 * for). Cached in a long-lived cookie so it survives reloads without recomputing. The value never travels
 * to the backend as a cookie — it's only ever read here, client-side, and sent explicitly per request.
 */
export function getFingerprint(): Promise<string> {
  cached ??= (async () => {
    const existing = Cookies.get(COOKIE_NAME)
    if (existing) return existing

    const agent = await FingerprintJS.load()
    const result = await agent.get()
    Cookies.set(COOKIE_NAME, result.visitorId, { expires: COOKIE_EXPIRY_DAYS, sameSite: 'Lax' })
    return result.visitorId
  })()
  return cached
}
