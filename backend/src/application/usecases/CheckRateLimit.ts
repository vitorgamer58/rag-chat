import { RateLimitExceededError } from "../../domain/errors/RateLimitExceededError.js"
import type { IMessageRepository } from "../../domain/interfaces/repositories.js"
import type { IUseCase } from "../../domain/interfaces/usecases.js"

class CheckRateLimit implements IUseCase<{ userId: string }, void> {
  private _messageRepository: IMessageRepository
  private _maxMessages: number
  private _windowMinutes: number

  constructor({
    messageRepository,
    maxMessages,
    windowMinutes
  }: {
    messageRepository: IMessageRepository
    maxMessages: number
    windowMinutes: number
  }) {
    this._messageRepository = messageRepository
    this._maxMessages = maxMessages
    this._windowMinutes = windowMinutes
  }

  /** Throws RateLimitExceededError when the user already sent `maxMessages` in the last `windowMinutes`. */
  async execute({ userId }: { userId: string }): Promise<void> {
    const windowMs = this._windowMinutes * 60_000
    const now = Date.now()
    const { count, oldestAt } = await this._messageRepository.getUserMessageUsageSince({
      userId,
      since: new Date(now - windowMs)
    })
    if (count < this._maxMessages) return

    const retryAfterMs = oldestAt ? oldestAt.getTime() + windowMs - now : windowMs
    throw new RateLimitExceededError(
      this._maxMessages,
      this._windowMinutes,
      Math.max(1, Math.ceil(retryAfterMs / 1000))
    )
  }
}

export default CheckRateLimit
