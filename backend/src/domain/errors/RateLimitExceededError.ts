import { DomainError } from "./DomainError.js"

export class RateLimitExceededError extends DomainError {
  readonly code = "RATE_LIMIT_EXCEEDED"

  constructor(
    readonly maxMessages: number,
    readonly windowMinutes: number,
    readonly retryAfterSeconds: number
  ) {
    super(`Rate limit exceeded: ${maxMessages} messages per ${windowMinutes} minute(s)`)
  }
}
