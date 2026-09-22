import { getFingerprint } from '@/composables/useFingerprint'
import type { ApiErrorBody, ApiErrorIssue } from '@/types/api'

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string

/** A well-formed error response from the backend: `{ error: { code, message, ... } }`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfterSeconds: number | undefined
  readonly issues: ApiErrorIssue[] | undefined

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.error.code
    this.retryAfterSeconds = body.error.retryAfterSeconds
    this.issues = body.error.issues
  }
}

/** The backend could not be reached at all, or replied with something that isn't the expected JSON shape. */
export class NetworkError extends Error {
  constructor(message = 'Could not reach the server.') {
    super(message)
    this.name = 'NetworkError'
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object'
  )
}

/** Fetches JSON from the backend, injecting the fingerprint header and translating failures into typed errors. */
export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const fingerprint = await getFingerprint()

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Fingerprint': fingerprint,
        ...init.headers,
      },
    })
  } catch {
    throw new NetworkError()
  }

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    if (isApiErrorBody(body)) throw new ApiError(res.status, body)
    throw new NetworkError(`Unexpected server response (${res.status}).`)
  }

  if (res.status === 204) return undefined as T
  return await res.json().catch(() => {
    // A 2xx response that isn't valid JSON (e.g. a dev-server fallback page for a misconfigured base URL, or a
    // proxy's HTML error page in production) must still surface as a typed, user-facing error, not a raw
    // SyntaxError that `describeError` wouldn't recognize.
    throw new NetworkError('Unexpected server response (not JSON).')
  })
}

export { BASE_URL }
