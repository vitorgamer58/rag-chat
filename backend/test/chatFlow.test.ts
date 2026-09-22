import { afterEach, describe, expect, it, vi } from "vitest"
import { buildTestApp, createCaller, readSse } from "./helpers.js"
import { ScriptedLLMClient } from "./fakes.js"

type TestApp = ReturnType<typeof buildTestApp>

describe("chat flow over HTTP", () => {
  let app: TestApp

  afterEach(() => {
    app.close()
  })

  const setup = (options: Parameters<typeof buildTestApp>[0]) => {
    app = buildTestApp(options)
    return createCaller(app.baseUrl)
  }

  const createChat = async (call: ReturnType<typeof createCaller>, fingerprint?: string) => {
    const response = await call("/api/chats", { method: "POST", ...(fingerprint ? { fingerprint } : {}) })
    expect(response.status).toBe(201)
    return ((await response.json()) as { chat: { id: string } }).chat.id
  }

  const sendMessage = async (call: ReturnType<typeof createCaller>, chatId: string, content: string) => {
    const response = await call(`/api/chats/${chatId}/messages`, { method: "POST", body: { content } })
    return { status: response.status, body: (await response.json()) as Record<string, string> }
  }

  it("streams the answer chunk by chunk and stores the final message", async () => {
    const call = setup({ llmClient: new ScriptedLLMClient(["Hello", " brave", " world"]) })
    const chatId = await createChat(call)

    const sent = await sendMessage(call, chatId, "Say hi")
    expect(sent.status).toBe(202)

    const stream = await call(`/api/chats/${chatId}/messages/${sent.body["assistantMessageId"]}/stream`)
    expect(stream.headers.get("content-type")).toContain("text/event-stream")
    const events = await readSse(stream)

    expect(events.filter((event) => event.event === "chunk").map((event) => event.id)).toEqual(["1", "2", "3"])
    expect(events.at(-1)).toEqual({ event: "done", data: { content: "Hello brave world" } })

    const history = (await (await call(`/api/chats/${chatId}/messages`)).json()) as {
      messages: { role: string; content: string; status: string }[]
    }
    expect(history.messages.map((message) => [message.role, message.content, message.status])).toEqual([
      ["user", "Say hi", "done"],
      ["assistant", "Hello brave world", "done"]
    ])

    const chats = (await (await call("/api/chats")).json()) as { chats: { title: string }[] }
    expect(chats.chats[0]?.title).toBe("Say hi")
  })

  it("resumes with Last-Event-ID after the connection drops, without repeating chunks", async () => {
    let releaseLLM!: () => void
    const gate = new Promise<void>((resolve) => (releaseLLM = resolve))
    const call = setup({ llmClient: new ScriptedLLMClient(["Hello", " brave", " new", " world"], { gate }) })
    const chatId = await createChat(call)
    const sent = await sendMessage(call, chatId, "Say hi")
    const streamPath = `/api/chats/${chatId}/messages/${sent.body["assistantMessageId"]}/stream`

    // First connection: gets chunk 1 and then loses the connection while the model is paused.
    const firstConnection = await readSse(await call(streamPath), (events) => events.some((e) => e.id === "1"))
    expect(firstConnection.map((event) => event.id)).toEqual(["1"])

    releaseLLM()
    await vi.waitFor(() => expect(app.messageRepository.get(sent.body["assistantMessageId"]!).status).toBe("done"))

    const resumed = await readSse(await call(streamPath, { headers: { "Last-Event-ID": "1" } }))

    expect(resumed.filter((event) => event.event === "chunk").map((event) => event.id)).toEqual(["2", "3", "4"])
    expect(resumed.at(-1)).toEqual({ event: "done", data: { content: "Hello brave new world" } })
  })

  it("also resumes while the generation is still running, picking up live chunks after the replay", async () => {
    let releaseLLM!: () => void
    const gate = new Promise<void>((resolve) => (releaseLLM = resolve))
    const call = setup({ llmClient: new ScriptedLLMClient(["A", "B", "C"], { gate }) })
    const chatId = await createChat(call)
    const sent = await sendMessage(call, chatId, "Go")
    const streamPath = `/api/chats/${chatId}/messages/${sent.body["assistantMessageId"]}/stream`

    const reconnection = call(streamPath, { headers: { "Last-Event-ID": "1" } })
    // Let the client subscribe to the live stream, then let the model continue.
    setTimeout(releaseLLM, 50)
    const events = await readSse(await reconnection)

    expect(events.filter((event) => event.event === "chunk").map((event) => event.id)).toEqual(["2", "3"])
    expect(events.at(-1)?.event).toBe("done")
  })

  it("accepts the fingerprint and the resume point as query params for EventSource clients", async () => {
    const call = setup({ llmClient: new ScriptedLLMClient(["A", "B"]) })
    const chatId = await createChat(call)
    const sent = await sendMessage(call, chatId, "Go")
    await vi.waitFor(() => expect(app.messageRepository.get(sent.body["assistantMessageId"]!).status).toBe("done"))

    const response = await call(
      `/api/chats/${chatId}/messages/${sent.body["assistantMessageId"]}/stream?fingerprint=fingerprint-user-1&lastEventId=1`,
      { fingerprint: null }
    )
    const events = await readSse(response)

    expect(events.filter((event) => event.event === "chunk").map((event) => event.id)).toEqual(["2"])
  })

  it("reports a failed generation to the client without leaking the technical reason", async () => {
    const call = setup({ llmClient: new ScriptedLLMClient(["A", "B"], { failAfter: 1 }) })
    const chatId = await createChat(call)
    const sent = await sendMessage(call, chatId, "Go")

    const events = await readSse(await call(`/api/chats/${chatId}/messages/${sent.body["assistantMessageId"]}/stream`))

    expect(events.at(-1)?.event).toBe("failed")
    expect(JSON.stringify(events.at(-1))).not.toContain("exploded")
    const stored = app.messageRepository.get(sent.body["assistantMessageId"]!)
    expect(stored.status).toBe("failed")
    expect(stored.error).toContain("LLM exploded")

    // A failed generation frees the chat for the next question.
    const next = await sendMessage(call, chatId, "Try again")
    expect(next.status).toBe(202)
  })

  it("keeps each user's chats private", async () => {
    const call = setup({ llmClient: new ScriptedLLMClient(["A"]) })
    const chatId = await createChat(call)
    const sent = await sendMessage(call, chatId, "Secret")

    const intruder = "fingerprint-intruder"
    expect((await call(`/api/chats/${chatId}/messages`, { fingerprint: intruder })).status).toBe(404)
    expect(
      (await call(`/api/chats/${chatId}/messages/${sent.body["assistantMessageId"]}/stream`, { fingerprint: intruder }))
        .status
    ).toBe(404)
    expect(
      (await call(`/api/chats/${chatId}/messages`, { fingerprint: intruder, method: "POST", body: { content: "hi" } }))
        .status
    ).toBe(404)
    const chats = (await (await call("/api/chats", { fingerprint: intruder })).json()) as { chats: unknown[] }
    expect(chats.chats).toEqual([])
  })

  it("registers users on first contact and rejects a missing or malformed fingerprint", async () => {
    const call = setup({ llmClient: new ScriptedLLMClient(["A"]) })

    expect((await call("/api/chats", { fingerprint: null })).status).toBe(400)
    expect((await call("/api/chats", { fingerprint: "short" })).status).toBe(400)
    expect(app.userRepository.users.size).toBe(0)

    await call("/api/chats")
    await call("/api/chats")
    expect([...app.userRepository.users.keys()]).toEqual(["fingerprint-user-1"])
  })

  it("rate limits per user, answering 429 with Retry-After", async () => {
    const call = setup({ llmClient: new ScriptedLLMClient(["A"]), maxMessages: 2 })
    const chatId = await createChat(call)

    for (const question of ["one", "two"]) {
      const sent = await sendMessage(call, chatId, question)
      expect(sent.status).toBe(202)
      await vi.waitFor(() => expect(app.messageRepository.get(sent.body["assistantMessageId"]!).status).toBe("done"))
    }

    const blocked = await call(`/api/chats/${chatId}/messages`, { method: "POST", body: { content: "three" } })
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMIT_EXCEEDED")

    // Another user is not affected.
    const otherCall = createCaller(app.baseUrl)
    const otherChat = await createChat(otherCall, "fingerprint-user-2")
    const other = await otherCall(`/api/chats/${otherChat}/messages`, {
      fingerprint: "fingerprint-user-2",
      method: "POST",
      body: { content: "hello" }
    })
    expect(other.status).toBe(202)
  })

  it("refuses a second question while the chat is still generating", async () => {
    let releaseLLM!: () => void
    const gate = new Promise<void>((resolve) => (releaseLLM = resolve))
    const call = setup({ llmClient: new ScriptedLLMClient(["A", "B"], { gate }) })
    const chatId = await createChat(call)

    const first = await sendMessage(call, chatId, "first")
    const second = await sendMessage(call, chatId, "second")

    expect(second.status).toBe(409)
    expect(second.body["error"]).toMatchObject({ code: "CHAT_BUSY" })
    // The rejected question must not be stored (nor counted by the rate limit).
    expect(app.messageRepository.messages.filter((message) => message.role === "user")).toHaveLength(1)

    releaseLLM()
    await vi.waitFor(() => expect(app.messageRepository.get(first.body["assistantMessageId"]!).status).toBe("done"))
  })

  it("validates the message body", async () => {
    const call = setup({ llmClient: new ScriptedLLMClient(["A"]) })
    const chatId = await createChat(call)

    expect((await sendMessage(call, chatId, "   ")).status).toBe(400)
    expect((await sendMessage(call, chatId, "x".repeat(101))).status).toBe(400)
    expect(
      (await call(`/api/chats/not-an-object-id/messages`, { method: "POST", body: { content: "hi" } })).status
    ).toBe(404)
  })

  it("answers the follow-up using the conversation history and the retrieved context", async () => {
    const llm = new ScriptedLLMClient(["ok"])
    const call = setup({
      llmClient: llm,
      retrievedChunks: [
        { title: "Paper", chunkIndex: 3, text: "relevant text", score: 0.9 },
        { title: "Noise", chunkIndex: 0, text: "irrelevant text", score: 0.5 }
      ]
    })
    const chatId = await createChat(call)

    const first = await sendMessage(call, chatId, "first question")
    await vi.waitFor(() => expect(app.messageRepository.get(first.body["assistantMessageId"]!).status).toBe("done"))
    const second = await sendMessage(call, chatId, "second question")
    await vi.waitFor(() => expect(app.messageRepository.get(second.body["assistantMessageId"]!).status).toBe("done"))

    expect(llm.receivedMessages[1]?.map((message) => [message.role, message.content])).toEqual([
      ["system", "SYSTEM"],
      ["user", "first question"],
      ["assistant", "ok"],
      ["user", "CTX[relevant text]\nQ: second question"]
    ])
    expect(app.messageRepository.get(second.body["assistantMessageId"]!).sources).toEqual([
      { title: "Paper", chunkIndex: 3, score: 0.9 }
    ])
    expect(app.embeddingClient.queries).toEqual(["first question", "second question"])
  })
})
