import { randomUUID } from "node:crypto"
import type { ChatType } from "../src/domain/entities/Chat.js"
import type { LLMMessageType } from "../src/domain/entities/LLMMessage.js"
import type { MessageSourceType, MessageType } from "../src/domain/entities/Message.js"
import type { MessageChunkType } from "../src/domain/entities/MessageChunk.js"
import type { RetrievedChunkType } from "../src/domain/entities/RetrievedChunk.js"
import type { UserType } from "../src/domain/entities/User.js"
import type { ConfigKeyType } from "../src/domain/enums/ConfigKey.js"
import { MessageRole } from "../src/domain/enums/MessageRole.js"
import { MessageStatus } from "../src/domain/enums/MessageStatus.js"
import { ChatBusyError } from "../src/domain/errors/ChatBusyError.js"
import { ConfigNotFoundError } from "../src/domain/errors/ConfigNotFoundError.js"
import type { IEmbeddingClient, ILLMClient } from "../src/domain/interfaces/clients.js"
import type {
  IChatRepository,
  IChunkedDataRepository,
  IConfigRepository,
  IMessageChunkRepository,
  IMessageRepository,
  IUserRepository,
  NewMessage
} from "../src/domain/interfaces/repositories.js"
import type { ILogger } from "../src/domain/interfaces/services.js"

const silentLogger: ILogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

class FakeUserRepository implements IUserRepository {
  users = new Map<string, UserType>()

  async upsertByFingerprint({ fingerprint, lastIp }: { fingerprint: string; lastIp?: string | undefined }) {
    const now = new Date()
    const existing = this.users.get(fingerprint)
    const user: UserType = {
      id: existing?.id ?? randomUUID(),
      fingerprint,
      createdAt: existing?.createdAt ?? now,
      lastSeenAt: now,
      ...(lastIp ? { lastIp } : {})
    }
    this.users.set(fingerprint, user)
    return user
  }
}

class FakeChatRepository implements IChatRepository {
  chats: ChatType[] = []

  async create({ userId }: { userId: string }) {
    const now = new Date()
    const chat: ChatType = { id: randomUUID(), userId, title: null, createdAt: now, updatedAt: now }
    this.chats.push(chat)
    return chat
  }

  async findByIdAndUserId({ id, userId }: { id: string; userId: string }) {
    return this.chats.find((chat) => chat.id === id && chat.userId === userId) ?? null
  }

  async listByUserId({ userId, limit, before }: { userId: string; limit: number; before?: Date | undefined }) {
    return this.chats
      .filter((chat) => chat.userId === userId && (!before || chat.updatedAt < before))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
  }

  async setTitleIfUntitled({ id, title }: { id: string; title: string }) {
    const chat = this.chats.find((item) => item.id === id)
    if (chat && chat.title === null) chat.title = title
  }

  async touch(id: string) {
    const chat = this.chats.find((item) => item.id === id)
    if (chat) chat.updatedAt = new Date()
  }
}

class FakeMessageRepository implements IMessageRepository {
  messages: MessageType[] = []

  async create(message: NewMessage) {
    const isActive = (item: MessageType) =>
      item.role === MessageRole.ASSISTANT &&
      (item.status === MessageStatus.PENDING || item.status === MessageStatus.STREAMING)
    const creatingActive = message.role === MessageRole.ASSISTANT && message.status === MessageStatus.PENDING
    if (creatingActive && this.messages.some((item) => item.chatId === message.chatId && isActive(item))) {
      throw new ChatBusyError()
    }
    const created: MessageType = { id: randomUUID(), ...message, sources: [] }
    this.messages.push(created)
    return created
  }

  async findByIdAndChatId({ id, chatId, userId }: { id: string; chatId: string; userId: string }) {
    return this.messages.find((item) => item.id === id && item.chatId === chatId && item.userId === userId) ?? null
  }

  async listByChatId({ chatId, userId }: { chatId: string; userId: string }) {
    return this.messages
      .filter((item) => item.chatId === chatId && item.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async listHistory({ chatId, before, limit }: { chatId: string; before: Date; limit: number }) {
    return this.messages
      .filter(
        (item) =>
          item.chatId === chatId &&
          item.createdAt < before &&
          (item.role === MessageRole.USER || item.status === MessageStatus.DONE)
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-limit)
  }

  async getUserMessageUsageSince({ userId, since }: { userId: string; since: Date }) {
    const inWindow = this.messages.filter(
      (item) => item.userId === userId && item.role === MessageRole.USER && item.createdAt >= since
    )
    const oldest = inWindow.map((item) => item.createdAt.getTime()).sort((a, b) => a - b)[0]
    return { count: inWindow.length, oldestAt: oldest === undefined ? null : new Date(oldest) }
  }

  async markStreaming({ id, provider, model }: { id: string; provider: string; model: string }) {
    Object.assign(this.require(id), { status: MessageStatus.STREAMING, provider, model })
  }

  async complete({ id, content, sources }: { id: string; content: string; sources: MessageSourceType[] }) {
    Object.assign(this.require(id), { status: MessageStatus.DONE, content, sources, completedAt: new Date() })
  }

  async fail({ id, error }: { id: string; error: string }) {
    Object.assign(this.require(id), { status: MessageStatus.FAILED, error, completedAt: new Date() })
  }

  async failStale() {
    const stale = this.messages.filter(
      (item) => item.status === MessageStatus.PENDING || item.status === MessageStatus.STREAMING
    )
    stale.forEach((item) => Object.assign(item, { status: MessageStatus.FAILED }))
    return stale.length
  }

  get(id: string): MessageType {
    return this.require(id)
  }

  private require(id: string): MessageType {
    const message = this.messages.find((item) => item.id === id)
    if (!message) throw new Error(`Message ${id} not found`)
    return message
  }
}

class FakeMessageChunkRepository implements IMessageChunkRepository {
  chunks: MessageChunkType[] = []

  async insert({ messageId, seq, text }: { messageId: string; seq: number; text: string }) {
    this.chunks.push({ messageId, seq, text, createdAt: new Date() })
  }

  async listAfter({ messageId, afterSeq }: { messageId: string; afterSeq: number }) {
    return this.chunks.filter((chunk) => chunk.messageId === messageId && chunk.seq > afterSeq)
  }
}

class FakeConfigRepository implements IConfigRepository {
  constructor(private readonly values: Partial<Record<ConfigKeyType, string>>) {}

  async getValue(key: ConfigKeyType) {
    const value = this.values[key]
    if (value === undefined) throw new ConfigNotFoundError(key)
    return value
  }
}

class FakeChunkedDataRepository implements IChunkedDataRepository {
  constructor(private readonly chunks: RetrievedChunkType[] = []) {}

  async vectorSearch({ limit }: { queryVector: number[]; limit: number; numCandidates: number }) {
    return this.chunks.slice(0, limit)
  }
}

class FakeEmbeddingClient implements IEmbeddingClient {
  queries: string[] = []

  async embed(text: string) {
    this.queries.push(text)
    return [0.1, 0.2, 0.3]
  }
}

/** Streams the given tokens; `gate` lets a test hold the stream after the first token. */
class ScriptedLLMClient implements ILLMClient {
  readonly provider = "FAKE"
  readonly model = "fake-model"
  receivedMessages: LLMMessageType[][] = []

  constructor(
    private readonly tokens: string[],
    private readonly options: { failAfter?: number; gate?: Promise<void> } = {}
  ) {}

  async *stream(messages: LLMMessageType[]): AsyncGenerator<string> {
    this.receivedMessages.push(messages)
    for (const [index, token] of this.tokens.entries()) {
      if (this.options.failAfter !== undefined && index >= this.options.failAfter) {
        throw new Error("LLM exploded")
      }
      if (index === 1 && this.options.gate) await this.options.gate
      yield token
    }
  }
}

const RAG_CONFIG: Partial<Record<ConfigKeyType, string>> = {
  system_prompt: "SYSTEM",
  user_message_template: "{{context}}Q: {{question}}",
  context_template: "CTX[{{chunks}}]\n"
}

export {
  silentLogger,
  RAG_CONFIG,
  FakeUserRepository,
  FakeChatRepository,
  FakeMessageRepository,
  FakeMessageChunkRepository,
  FakeConfigRepository,
  FakeChunkedDataRepository,
  FakeEmbeddingClient,
  ScriptedLLMClient
}
