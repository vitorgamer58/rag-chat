import type { ChatType } from "../entities/Chat.js"
import type { MessageChunkType } from "../entities/MessageChunk.js"
import type { MessageSourceType, MessageType } from "../entities/Message.js"
import type { RetrievedChunkType } from "../entities/RetrievedChunk.js"
import type { UserType } from "../entities/User.js"
import type { ConfigKeyType } from "../enums/ConfigKey.js"
import type { MessageRoleType } from "../enums/MessageRole.js"
import type { MessageStatusType } from "../enums/MessageStatus.js"

export interface IUserRepository {
  upsertByFingerprint(params: { fingerprint: string; lastIp?: string | undefined }): Promise<UserType>
}

export interface IChatRepository {
  create(params: { userId: string }): Promise<ChatType>
  findByIdAndUserId(params: { id: string; userId: string }): Promise<ChatType | null>
  listByUserId(params: { userId: string; limit: number; before?: Date | undefined }): Promise<ChatType[]>
  setTitleIfUntitled(params: { id: string; title: string }): Promise<void>
  touch(id: string): Promise<void>
}

export type NewMessage = {
  chatId: string
  userId: string
  role: MessageRoleType
  content: string
  status: MessageStatusType
  createdAt: Date
}

export interface IMessageRepository {
  /**
   * Creates a message. An assistant message in `pending` state is the chat's single active generation: creating it
   * while another one is active throws ChatBusyError.
   */
  create(message: NewMessage): Promise<MessageType>
  findByIdAndChatId(params: { id: string; chatId: string; userId: string }): Promise<MessageType | null>
  listByChatId(params: { chatId: string; userId: string }): Promise<MessageType[]>
  /** Oldest first: user messages and completed assistant messages created before `before`. */
  listHistory(params: { chatId: string; before: Date; limit: number }): Promise<MessageType[]>
  getUserMessageUsageSince(params: { userId: string; since: Date }): Promise<{ count: number; oldestAt: Date | null }>
  markStreaming(params: { id: string; provider: string; model: string }): Promise<void>
  complete(params: { id: string; content: string; sources: MessageSourceType[] }): Promise<void>
  fail(params: { id: string; error: string }): Promise<void>
  /** Marks generations left in pending/streaming by a previous process as failed. */
  failStale(): Promise<number>
}

export interface IMessageChunkRepository {
  insert(params: { messageId: string; seq: number; text: string }): Promise<void>
  listAfter(params: { messageId: string; afterSeq: number }): Promise<MessageChunkType[]>
}

export interface IConfigRepository {
  /** Throws ConfigNotFoundError when the key does not exist. */
  getValue(key: ConfigKeyType): Promise<string>
}

export interface IChunkedDataRepository {
  vectorSearch(params: { queryVector: number[]; limit: number; numCandidates: number }): Promise<RetrievedChunkType[]>
}
