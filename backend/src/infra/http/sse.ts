import type { Response } from "express"
import type { StreamEventType } from "../../domain/entities/StreamEvent.js"

const RECONNECT_DELAY_MS = 3000

type SseConnection = {
  send(event: StreamEventType): void
  end(): void
}

/**
 * Text chunks carry their `seq` as the SSE `id`, so the browser's EventSource resends it as `Last-Event-ID` after a
 * dropped connection. Terminal events have no id, so the last chunk id is what a reconnect resumes from.
 * The terminal event is named `failed` rather than `error` because EventSource reserves `error` for connection errors.
 */
const openSse = (res: Response, heartbeatMs: number): SseConnection => {
  res.status(200)
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()
  res.write(`retry: ${RECONNECT_DELAY_MS}\n\n`)

  const canWrite = () => !res.writableEnded && !res.destroyed

  // Idle proxies (Cloudflare closes idle connections after ~100s) must see traffic while the model is thinking.
  const heartbeat = setInterval(() => {
    if (canWrite()) res.write(": ping\n\n")
  }, heartbeatMs)
  res.on("close", () => clearInterval(heartbeat))

  const write = (event: string, data: unknown, id?: number) => {
    if (!canWrite()) return
    res.write(`${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  return {
    send(event) {
      switch (event.type) {
        case "chunk":
          write("chunk", { seq: event.seq, text: event.text }, event.seq)
          break
        case "done":
          write("done", { content: event.content })
          break
        case "failed":
          write("failed", { message: event.message })
          break
      }
    },
    end() {
      clearInterval(heartbeat)
      if (canWrite()) res.end()
    }
  }
}

export { openSse }
