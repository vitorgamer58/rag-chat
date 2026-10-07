import type { AddressInfo } from "node:net"
import GenerationOrchestrator from "../src/application/services/GenerationOrchestrator.js"
import PromptBuilder from "../src/application/services/PromptBuilder.js"
import RagRetriever from "../src/application/services/RagRetriever.js"
import CheckRateLimit from "../src/application/usecases/CheckRateLimit.js"
import CreateChat from "../src/application/usecases/CreateChat.js"
import GetChatMessages from "../src/application/usecases/GetChatMessages.js"
import ListChats from "../src/application/usecases/ListChats.js"
import RegisterUser from "../src/application/usecases/RegisterUser.js"
import SendMessage from "../src/application/usecases/SendMessage.js"
import StreamMessage from "../src/application/usecases/StreamMessage.js"
import type { RetrievedChunkType } from "../src/domain/entities/RetrievedChunk.js"
import type { ILLMClient } from "../src/domain/interfaces/clients.js"
import { createApp } from "../src/infra/http/app.js"
import type { IpRateLimitOptions } from "../src/infra/http/middlewares/ipRateLimit.js"
import InMemoryMessageBus from "../src/infra/messaging/InMemoryMessageBus.js"
import {
  FakeChatRepository,
  FakeChunkedDataRepository,
  FakeConfigRepository,
  FakeEmbeddingClient,
  FakeMessageChunkRepository,
  FakeMessageRepository,
  FakeUserRepository,
  RAG_CONFIG,
  silentLogger
} from "./fakes.js"

const buildTestApp = ({
  llmClient,
  maxMessages = 20,
  retrievedChunks = [],
  ipRateLimit
}: {
  llmClient: ILLMClient
  maxMessages?: number
  retrievedChunks?: RetrievedChunkType[]
  ipRateLimit?: IpRateLimitOptions
}) => {
  const userRepository = new FakeUserRepository()
  const chatRepository = new FakeChatRepository()
  const messageRepository = new FakeMessageRepository()
  const messageChunkRepository = new FakeMessageChunkRepository()
  const embeddingClient = new FakeEmbeddingClient()
  const messageBus = new InMemoryMessageBus(silentLogger)

  const orchestrator = new GenerationOrchestrator({
    messageRepository,
    messageChunkRepository,
    configRepository: new FakeConfigRepository(RAG_CONFIG),
    ragRetriever: new RagRetriever({
      embeddingClient,
      chunkedDataRepository: new FakeChunkedDataRepository(retrievedChunks),
      retrieveK: 6,
      scoreThreshold: 0.8
    }),
    promptBuilder: new PromptBuilder(),
    llmClient,
    messageBus,
    logger: silentLogger,
    historyMaxMessages: 20,
    generationTimeoutMs: 10_000,
    flushIntervalMs: 5,
    maxBufferChars: 1 // every token becomes its own chunk, which makes seq predictable in tests
  })

  const app = createApp({
    registerUser: new RegisterUser({ userRepository }),
    createChat: new CreateChat({ chatRepository }),
    listChats: new ListChats({ chatRepository }),
    getChatMessages: new GetChatMessages({ chatRepository, messageRepository }),
    sendMessage: new SendMessage({
      chatRepository,
      messageRepository,
      checkRateLimit: new CheckRateLimit({ messageRepository, maxMessages, windowMinutes: 60 }),
      generationOrchestrator: orchestrator
    }),
    streamMessage: new StreamMessage({ messageRepository, messageChunkRepository, messageBus }),
    logger: silentLogger,
    corsOrigins: ["http://localhost:5173"],
    maxMessageLength: 100,
    sseHeartbeatMs: 60_000,
    ...(ipRateLimit ? { ipRateLimit } : {})
  })

  const server = app.listen(0)
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  return {
    baseUrl,
    userRepository,
    chatRepository,
    messageRepository,
    embeddingClient,
    close: () => {
      server.closeAllConnections()
      server.close()
    }
  }
}

type CallOptions = { fingerprint?: string | null; method?: string; body?: unknown; headers?: Record<string, string> }

const createCaller =
  (baseUrl: string) =>
  (path: string, { fingerprint = "fingerprint-user-1", method = "GET", body, headers = {} }: CallOptions = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(fingerprint ? { "X-Fingerprint": fingerprint } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })

type SseEvent = { id?: string; event?: string; data?: unknown }

/** Reads an SSE response. Stops (and drops the connection) as soon as `until` is satisfied, or at the end. */
const readSse = async (response: Response, until?: (events: SseEvent[]) => boolean): Promise<SseEvent[]> => {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const events: SseEvent[] = []
  let buffer = ""

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let separator = buffer.indexOf("\n\n")
    while (separator !== -1) {
      const rawEvent = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)
      separator = buffer.indexOf("\n\n")

      const event: SseEvent = {}
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("id: ")) event.id = line.slice(4)
        else if (line.startsWith("event: ")) event.event = line.slice(7)
        else if (line.startsWith("data: ")) event.data = JSON.parse(line.slice(6))
      }
      if (event.event) events.push(event)
    }

    if (until?.(events)) {
      await reader.cancel()
      break
    }
  }
  return events
}

export { buildTestApp, createCaller, readSse }
export type { SseEvent }
