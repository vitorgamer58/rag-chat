import type { Collection, Db, Filter, WithId } from "mongodb"
import type { ChatType } from "../../../domain/entities/Chat.js"
import type { IChatRepository } from "../../../domain/interfaces/repositories.js"
import { Collections, toObjectId, type ChatDoc } from "../documents.js"

const toDomain = (doc: WithId<ChatDoc>): ChatType => ({
  id: doc._id.toHexString(),
  userId: doc.userId,
  title: doc.title,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt
})

class ChatRepository implements IChatRepository {
  private _collection: Collection<ChatDoc>

  constructor(db: Db) {
    this._collection = db.collection<ChatDoc>(Collections.CHATS)
  }

  async create({ userId }: { userId: string }): Promise<ChatType> {
    const now = new Date()
    const doc: ChatDoc = { userId, title: null, createdAt: now, updatedAt: now }
    const { insertedId } = await this._collection.insertOne(doc)
    return toDomain({ _id: insertedId, ...doc })
  }

  async findByIdAndUserId({ id, userId }: { id: string; userId: string }): Promise<ChatType | null> {
    const _id = toObjectId(id)
    if (!_id) return null
    const doc = await this._collection.findOne({ _id, userId })
    return doc ? toDomain(doc) : null
  }

  async listByUserId({
    userId,
    limit,
    before
  }: {
    userId: string
    limit: number
    before?: Date | undefined
  }): Promise<ChatType[]> {
    const filter: Filter<ChatDoc> = before ? { userId, updatedAt: { $lt: before } } : { userId }
    const docs = await this._collection.find(filter).sort({ updatedAt: -1, _id: -1 }).limit(limit).toArray()
    return docs.map(toDomain)
  }

  async setTitleIfUntitled({ id, title }: { id: string; title: string }): Promise<void> {
    const _id = toObjectId(id)
    if (!_id) return
    await this._collection.updateOne({ _id, title: null }, { $set: { title } })
  }

  async touch(id: string): Promise<void> {
    const _id = toObjectId(id)
    if (!_id) return
    await this._collection.updateOne({ _id }, { $set: { updatedAt: new Date() } })
  }
}

export default ChatRepository
