import type { RequestHandler } from "express"
import type { ILogger } from "../../../domain/interfaces/services.js"

/** Logs the path only: the query string may carry the fingerprint (SSE endpoint). */
const requestLogger =
  (logger: ILogger): RequestHandler =>
  (req, res, next) => {
    const startedAt = Date.now()
    res.on("finish", () => {
      logger.info(
        {
          method: req.method,
          path: req.baseUrl + req.path,
          status: res.statusCode,
          durationMs: Date.now() - startedAt
        },
        "request"
      )
    })
    next()
  }

export { requestLogger }
