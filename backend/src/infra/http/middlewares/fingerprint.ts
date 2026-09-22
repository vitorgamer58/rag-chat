import type { RequestHandler } from "express"
import { Fingerprint } from "../../../domain/entities/User.js"
import { InvalidFingerprintError } from "../../../domain/errors/InvalidFingerprintError.js"

const FINGERPRINT_HEADER = "x-fingerprint"

/**
 * Identifies the caller by the FingerprintJS visitor id sent in the `X-Fingerprint` header (never by IP: behind
 * Cloudflare the real client IP is not reliable). Note the id is client-provided, so it is an identifier, not proof.
 */
const fingerprint = (): RequestHandler => (req, res, next) => {
  const parsed = Fingerprint.safeParse(req.get(FINGERPRINT_HEADER))
  if (!parsed.success) {
    next(new InvalidFingerprintError())
    return
  }
  res.locals["fingerprint"] = parsed.data
  next()
}

/**
 * The browser's native EventSource cannot set custom headers, so the SSE endpoint also accepts the fingerprint (and the
 * initial `Last-Event-ID`) as query parameters. Mount it only in front of that endpoint.
 */
const allowQueryFingerprint = (): RequestHandler => (req, _res, next) => {
  const fromQuery = req.query["fingerprint"]
  if (!req.get(FINGERPRINT_HEADER) && typeof fromQuery === "string") {
    req.headers[FINGERPRINT_HEADER] = fromQuery
  }
  next()
}

export { fingerprint, allowQueryFingerprint }
