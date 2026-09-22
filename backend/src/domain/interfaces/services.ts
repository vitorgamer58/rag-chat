import type { StreamEventType } from "../entities/StreamEvent.js"

type LogFn = (context: Record<string, unknown>, message: string) => void

export interface ILogger {
  info: LogFn
  warn: LogFn
  error: LogFn
}

export interface IMessageBus {
  publish(messageId: string, event: StreamEventType): void
  /** Returns the unsubscribe function. */
  subscribe(messageId: string, listener: (event: StreamEventType) => void): () => void
}
