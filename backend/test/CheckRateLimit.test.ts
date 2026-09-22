import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import CheckRateLimit from "../src/application/usecases/CheckRateLimit.js"
import { RateLimitExceededError } from "../src/domain/errors/RateLimitExceededError.js"
import { FakeMessageRepository } from "./fakes.js"

describe("CheckRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const seedUserMessage = async (repository: FakeMessageRepository, userId: string, createdAt: Date) => {
    await repository.create({ chatId: "chat", userId, role: "user", content: "q", status: "done", createdAt })
  }

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

  it("allows a user under the limit", async () => {
    const repository = new FakeMessageRepository()
    await seedUserMessage(repository, "u1", minutesAgo(5))
    const useCase = new CheckRateLimit({ messageRepository: repository, maxMessages: 2, windowMinutes: 60 })

    await expect(useCase.execute({ userId: "u1" })).resolves.toBeUndefined()
  })

  it("blocks once the limit is reached and reports when the oldest message leaves the window", async () => {
    const repository = new FakeMessageRepository()
    await seedUserMessage(repository, "u1", minutesAgo(50))
    await seedUserMessage(repository, "u1", minutesAgo(5))
    const useCase = new CheckRateLimit({ messageRepository: repository, maxMessages: 2, windowMinutes: 60 })

    const error = await useCase.execute({ userId: "u1" }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(RateLimitExceededError)
    expect((error as RateLimitExceededError).retryAfterSeconds).toBe(10 * 60)
  })

  it("ignores messages outside the window and messages from other users", async () => {
    const repository = new FakeMessageRepository()
    await seedUserMessage(repository, "u1", minutesAgo(61))
    await seedUserMessage(repository, "u2", minutesAgo(1))
    await seedUserMessage(repository, "u2", minutesAgo(2))
    const useCase = new CheckRateLimit({ messageRepository: repository, maxMessages: 2, windowMinutes: 60 })

    await expect(useCase.execute({ userId: "u1" })).resolves.toBeUndefined()
  })
})
