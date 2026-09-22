import type { Db } from "mongodb"
import {
  Collections,
  type ChatDoc,
  type ConfigDoc,
  type MessageChunkDoc,
  type MessageDoc,
  type UserDoc
} from "./documents.js"

const MESSAGE_CHUNK_TTL_SECONDS = 24 * 60 * 60

/** Idempotent: safe to run on every boot. */
const ensureIndexes = async (db: Db): Promise<void> => {
  await db.collection<UserDoc>(Collections.USERS).createIndex({ fingerprint: 1 }, { unique: true })

  await db.collection<ChatDoc>(Collections.CHATS).createIndex({ userId: 1, updatedAt: -1 })

  const messages = db.collection<MessageDoc>(Collections.MESSAGES)
  await messages.createIndex({ chatId: 1, createdAt: 1 })
  // Serves the rate limit count and lets us analyse what each user asked.
  await messages.createIndex({ userId: 1, role: 1, createdAt: 1 })
  // At most one generation in progress per chat, enforced by the database (race-free).
  await messages.createIndex(
    { chatId: 1 },
    { unique: true, partialFilterExpression: { active: true }, name: "one_active_generation_per_chat" }
  )

  const chunks = db.collection<MessageChunkDoc>(Collections.MESSAGE_CHUNKS)
  await chunks.createIndex({ messageId: 1, seq: 1 }, { unique: true })
  // Chunks only exist so that clients can resume a stream; the final text lives in the message itself.
  await chunks.createIndex({ createdAt: 1 }, { expireAfterSeconds: MESSAGE_CHUNK_TTL_SECONDS })

  await db.collection<ConfigDoc>(Collections.APP_CONFIG).createIndex({ key: 1 }, { unique: true })
}

export { ensureIndexes }
