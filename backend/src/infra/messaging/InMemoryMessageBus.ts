import type { StreamEventType } from "../../domain/entities/StreamEvent.js"
import type { ILogger, IMessageBus } from "../../domain/interfaces/services.js"

type Listener = (event: StreamEventType) => void

/** Single-process pub/sub. Replay always comes from the database, so this can be swapped for Redis later. */
class InMemoryMessageBus implements IMessageBus {
  private _listeners = new Map<string, Set<Listener>>()
  private _logger: ILogger

  constructor(logger: ILogger) {
    this._logger = logger
  }

  publish(messageId: string, event: StreamEventType): void {
    for (const listener of [...(this._listeners.get(messageId) ?? [])]) {
      try {
        listener(event)
      } catch (error) {
        this._logger.error({ err: error, messageId }, "Message bus listener failed")
      }
    }
  }

  subscribe(messageId: string, listener: Listener): () => void {
    const listeners = this._listeners.get(messageId) ?? new Set<Listener>()
    listeners.add(listener)
    this._listeners.set(messageId, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this._listeners.delete(messageId)
    }
  }
}

export default InMemoryMessageBus
