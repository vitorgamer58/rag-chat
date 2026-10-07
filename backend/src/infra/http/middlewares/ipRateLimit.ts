import type { Request, RequestHandler } from "express"
import { ipKeyGenerator, rateLimit, type RateLimitInfo } from "express-rate-limit"

type IpRateLimitOptions = {
  windowMs: number
  /** Every /api request. */
  generalMax: number
  /** Chat creation and message sending: the requests that write data or cost money. */
  writeMax: number
  /** Opening the SSE stream. */
  streamMax: number
}

type IpRateLimiters = { general: RequestHandler; write: RequestHandler; stream: RequestHandler }

const DEFAULT_IP_RATE_LIMIT: IpRateLimitOptions = { windowMs: 60_000, generalMax: 120, writeMax: 20, streamMax: 30 }

/**
 * Per-IP limits, the layer a client cannot dodge by rotating `X-Fingerprint`. Counters live in memory, which is fine
 * for the single-instance deployment (the message bus is in-memory too). Relies on `trust proxy` so `req.ip` is the
 * real client address.
 */
const createIpRateLimiters = (options: IpRateLimitOptions = DEFAULT_IP_RATE_LIMIT): IpRateLimiters => {
  const build = (limit: number): RequestHandler =>
    rateLimit({
      windowMs: options.windowMs,
      limit,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      // Groups IPv6 addresses by /56 so one host cannot dodge the limit with many addresses.
      keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
      handler: (req, res) => {
        const resetTime = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit?.resetTime
        const retryAfterSeconds = Math.max(1, Math.ceil(((resetTime?.getTime() ?? Date.now()) - Date.now()) / 1000))
        res.setHeader("Retry-After", String(retryAfterSeconds))
        res.status(429).json({
          error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests", retryAfterSeconds }
        })
      }
    })

  return { general: build(options.generalMax), write: build(options.writeMax), stream: build(options.streamMax) }
}

export { createIpRateLimiters, DEFAULT_IP_RATE_LIMIT }
export type { IpRateLimitOptions, IpRateLimiters }
