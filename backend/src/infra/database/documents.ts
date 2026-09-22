import { ObjectId } from "mongodb"
import type { MessageSourceType } from "../../domain/entities/Message.js"
import type { MessageRoleType } from "../../domain/enums/MessageRole.js"
import type { MessageStatusType } from "../../domain/enums/MessageStatus.js"

// Documents are declared without `_id`: the driver types reads as WithId<Doc> and lets inserts omit it.

const Collections = {
  USERS: "users",
  CHATS: "chats",
  MESSAGES: "messages",
  MESSAGE_CHUNKS: "message_chunks",
  APP_CONFIG: "app_config",
  CHUNKED_DATA: "chunked_data"
} as const

type UserDoc = {
  fingerprint: string
  createdAt: Date
  lastSeenAt: Date
  lastIp?: string
}

type ChatDoc = {
  userId: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}

type MessageDoc = {
  chatId: ObjectId
  userId: string
  role: MessageRoleType
  content: string
  status: MessageStatusType
  sources: MessageSourceType[]
  provider?: string
  model?: string
  error?: string
  /** Only present while an assistant message is generating; backs the "one active generation per chat" index. */
  active?: true
  createdAt: Date
  completedAt?: Date
}

type MessageChunkDoc = {
  messageId: ObjectId
  seq: number
  text: string
  createdAt: Date
}

type ConfigDoc = {
  key: string
  value: string
  updatedAt: Date
}

type ChunkedDataDoc = {
  text: string
  embedding: number[]
  title: string
  chunk_index: number
  chunk_size: number
}

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i

/** Returns null instead of throwing when the string is not a valid ObjectId (e.g. a made-up id in a URL). */
const toObjectId = (id: string): ObjectId | null => (OBJECT_ID_REGEX.test(id) ? new ObjectId(id) : null)

const DUPLICATE_KEY_ERROR_CODE = 11000

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === DUPLICATE_KEY_ERROR_CODE

export { Collections, toObjectId, isDuplicateKeyError }
export type { UserDoc, ChatDoc, MessageDoc, MessageChunkDoc, ConfigDoc, ChunkedDataDoc }
