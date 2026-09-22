import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChunkBatcher } from "../src/application/services/ChunkBatcher.js"

describe("ChunkBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = (
    overrides: { maxBufferChars?: number; onFlush?: (chunk: { seq: number; text: string }) => Promise<void> } = {}
  ) => {
    const flushed: { seq: number; text: string }[] = []
    const batcher = new ChunkBatcher({
      flushIntervalMs: 200,
      maxBufferChars: overrides.maxBufferChars ?? 1000,
      onFlush:
        overrides.onFlush ??
        (async (chunk) => {
          flushed.push(chunk)
        })
    })
    return { batcher, flushed }
  }

  it("flushes the first token immediately and batches the following ones by time", async () => {
    const { batcher, flushed } = setup()

    batcher.push("Hel")
    await vi.advanceTimersByTimeAsync(0)
    expect(flushed).toEqual([{ seq: 1, text: "Hel" }])

    batcher.push("lo")
    batcher.push(" world")
    await vi.advanceTimersByTimeAsync(199)
    expect(flushed).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(flushed).toEqual([
      { seq: 1, text: "Hel" },
      { seq: 2, text: "lo world" }
    ])
  })

  it("flushes as soon as the buffer is full", async () => {
    const { batcher, flushed } = setup({ maxBufferChars: 5 })
    batcher.push("a")
    batcher.push("bcd")
    batcher.push("ef")
    await batcher.close()

    expect(flushed.map((chunk) => chunk.text)).toEqual(["a", "bcdef"])
  })

  it("flushes what is left on close, in order", async () => {
    const { batcher, flushed } = setup()
    batcher.push("one")
    batcher.push("two")
    await batcher.close()

    expect(flushed).toEqual([
      { seq: 1, text: "one" },
      { seq: 2, text: "two" }
    ])
  })

  it("rethrows a persistence error on close and stops writing", async () => {
    const attempts: number[] = []
    const { batcher } = setup({
      onFlush: async ({ seq }) => {
        attempts.push(seq)
        throw new Error("disk full")
      }
    })
    batcher.push("one")
    batcher.push("two")

    await expect(batcher.close()).rejects.toThrow("disk full")
    expect(attempts).toEqual([1])
    expect(batcher.error).toBeInstanceOf(Error)
  })
})
