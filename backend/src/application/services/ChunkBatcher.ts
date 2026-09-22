type FlushedChunk = { seq: number; text: string }

/**
 * Groups streamed tokens into numbered batches so that we persist and publish a few events per second instead of one
 * per token. The first batch is flushed immediately to keep the time to first byte low. Batches are flushed
 * sequentially, so `seq` is always persisted and published in order.
 */
export class ChunkBatcher {
  private _flushIntervalMs: number
  private _maxBufferChars: number
  private _onFlush: (chunk: FlushedChunk) => Promise<void>
  private _buffer = ""
  private _seq = 0
  private _timer: NodeJS.Timeout | null = null
  private _chain: Promise<void> = Promise.resolve()
  private _error: unknown = null

  constructor({
    flushIntervalMs,
    maxBufferChars,
    onFlush
  }: {
    flushIntervalMs: number
    maxBufferChars: number
    onFlush: (chunk: FlushedChunk) => Promise<void>
  }) {
    this._flushIntervalMs = flushIntervalMs
    this._maxBufferChars = maxBufferChars
    this._onFlush = onFlush
  }

  get error(): unknown {
    return this._error
  }

  push(text: string): void {
    if (!text) return
    this._buffer += text

    if (this._seq === 0 || this._buffer.length >= this._maxBufferChars) {
      this.flushNow()
      return
    }
    this._timer ??= setTimeout(() => this.flushNow(), this._flushIntervalMs)
  }

  /** Flushes what is left and waits for every pending write. Rethrows the first persistence error, if any. */
  async close(): Promise<void> {
    this.flushNow()
    await this._chain
    if (this._error) throw this._error
  }

  private flushNow(): void {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    if (!this._buffer) return

    const chunk = { seq: ++this._seq, text: this._buffer }
    this._buffer = ""
    this._chain = this._chain.then(async () => {
      if (this._error) return
      try {
        await this._onFlush(chunk)
      } catch (error) {
        this._error = error
      }
    })
  }
}
