import { afterEach, describe, expect, it } from "vitest"
import { ScriptedLLMClient } from "./fakes.js"
import { buildTestApp, createCaller } from "./helpers.js"

describe("per-IP rate limit", () => {
  let app: ReturnType<typeof buildTestApp>

  afterEach(() => {
    app.close()
  })

  it("limits by IP even when the fingerprint changes on every request", async () => {
    app = buildTestApp({
      llmClient: new ScriptedLLMClient([]),
      ipRateLimit: { windowMs: 60_000, generalMax: 100, writeMax: 3, streamMax: 100 }
    })
    const call = createCaller(app.baseUrl)

    const statuses: number[] = []
    for (let i = 0; i < 5; i++) {
      statuses.push((await call("/api/chats", { method: "POST", fingerprint: `fingerprint-rotating-${i}` })).status)
    }

    expect(statuses).toEqual([201, 201, 201, 429, 429])
    expect(app.userRepository.users.size).toBe(3)
  })

  it("answers 429 in the API error format with Retry-After", async () => {
    app = buildTestApp({
      llmClient: new ScriptedLLMClient([]),
      ipRateLimit: { windowMs: 60_000, generalMax: 1, writeMax: 10, streamMax: 10 }
    })
    const call = createCaller(app.baseUrl)
    await call("/api/chats")

    const blocked = await call("/api/chats")
    const body = (await blocked.json()) as { error: { code: string; retryAfterSeconds: number } }

    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(body.error).toMatchObject({ code: "RATE_LIMIT_EXCEEDED" })
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("counts X-Forwarded-For clients from the loopback proxy separately", async () => {
    app = buildTestApp({
      llmClient: new ScriptedLLMClient([]),
      ipRateLimit: { windowMs: 60_000, generalMax: 1, writeMax: 10, streamMax: 10 }
    })
    const call = createCaller(app.baseUrl)

    const first = await call("/api/chats", { headers: { "X-Forwarded-For": "203.0.113.1" } })
    const other = await call("/api/chats", { headers: { "X-Forwarded-For": "203.0.113.2" } })
    const repeat = await call("/api/chats", { headers: { "X-Forwarded-For": "203.0.113.1" } })

    expect([first.status, other.status, repeat.status]).toEqual([200, 200, 429])
  })
})
