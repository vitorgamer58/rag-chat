import type { ErrorRequestHandler, RequestHandler } from "express"
import { ZodError } from "zod"
import { ChatBusyError } from "../../../domain/errors/ChatBusyError.js"
import { ChatNotFoundError } from "../../../domain/errors/ChatNotFoundError.js"
import { DomainError } from "../../../domain/errors/DomainError.js"
import { InvalidFingerprintError } from "../../../domain/errors/InvalidFingerprintError.js"
import { MessageNotFoundError } from "../../../domain/errors/MessageNotFoundError.js"
import { RateLimitExceededError } from "../../../domain/errors/RateLimitExceededError.js"
import type { ILogger } from "../../../domain/interfaces/services.js"

const statusByDomainError = (error: DomainError): number => {
  if (error instanceof InvalidFingerprintError) return 400
  if (error instanceof ChatNotFoundError || error instanceof MessageNotFoundError) return 404
  if (error instanceof ChatBusyError) return 409
  if (error instanceof RateLimitExceededError) return 429
  return 500
}

const httpStatusOf = (error: unknown): number | null => {
  if (typeof error !== "object" || error === null || !("status" in error)) return null
  const status = error.status
  return typeof status === "number" && status >= 400 && status < 500 ? status : null
}

const notFoundHandler = (): RequestHandler => (_req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: "Route not found" } })
}

const errorHandler =
  (logger: ILogger): ErrorRequestHandler =>
  // Express only treats a handler as an error handler when it declares all four parameters.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (error, req, res, _next) => {
    if (res.headersSent) {
      // Streaming already started (SSE): the only thing left to do is to close the connection.
      logger.error({ err: error, path: req.baseUrl + req.path }, "Error after the response started")
      res.end()
      return
    }

    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        }
      })
      return
    }

    if (error instanceof DomainError) {
      const status = statusByDomainError(error)
      if (status >= 500) {
        logger.error({ err: error, path: req.baseUrl + req.path }, "Domain error")
        res.status(status).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } })
        return
      }
      if (error instanceof RateLimitExceededError) {
        res.setHeader("Retry-After", String(error.retryAfterSeconds))
        res.status(status).json({
          error: { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds }
        })
        return
      }
      res.status(status).json({ error: { code: error.code, message: error.message } })
      return
    }

    // Errors raised by express itself, e.g. malformed JSON bodies or payloads that are too large.
    const status = httpStatusOf(error)
    if (status) {
      res.status(status).json({ error: { code: "BAD_REQUEST", message: "Bad request" } })
      return
    }

    logger.error({ err: error, path: req.baseUrl + req.path }, "Unhandled error")
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } })
  }

export { errorHandler, notFoundHandler }
