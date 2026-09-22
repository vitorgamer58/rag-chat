import type { Collection, Db } from "mongodb"
import type { MessageChunkType } from "../../../domain/entities/MessageChunk.js"
import type { IMessageChunkRepository } from "../../../domain/interfaces/repositories.js"
import { Collections, toObjectId, type MessageChunkDoc } from "../documents.js"

class MessageChunkRepository implements IMessageChunkRepository {
  private _collection: Collection<MessageChunkDoc>

  constructor(db: Db) {
    this._collection = db.collection<MessageChunkDoc>(Collections.MESSAGE_CHUNKS)
  }

  async insert({ messageId, seq, text }: { messageId: string; seq: number; text: string }): Promise<void> {
    const messageObjectId = toObjectId(messageId)
    if (!messageObjectId) throw new Error(`Invalid message id: ${messageId}`)
    await this._collection.insertOne({ messageId: messageObjectId, seq, text, createdAt: new Date() })
  }

  async listAfter({ messageId, afterSeq }: { messageId: string; afterSeq: number }): Promise<MessageChunkType[]> {
    const messageObjectId = toObjectId(messageId)
    if (!messageObjectId) return []
    const docs = await this._collection
      .find({ messageId: messageObjectId, seq: { $gt: afterSeq } })
      .sort({ seq: 1 })
      .toArray()
    return docs.map((doc) => ({ messageId, seq: doc.seq, text: doc.text, createdAt: doc.createdAt }))
  }
}

export default MessageChunkRepository
