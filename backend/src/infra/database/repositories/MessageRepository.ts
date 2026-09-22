import type { Collection, Db, WithId } from "mongodb"
import type { MessageSourceType, MessageType } from "../../../domain/entities/Message.js"
import { MessageRole } from "../../../domain/enums/MessageRole.js"
import { MessageStatus } from "../../../domain/enums/MessageStatus.js"
import { ChatBusyError } from "../../../domain/errors/ChatBusyError.js"
import { ChatNotFoundError } from "../../../domain/errors/ChatNotFoundError.js"
import type { IMessageRepository, NewMessage } from "../../../domain/interfaces/repositories.js"
import { Collections, isDuplicateKeyError, toObjectId, type MessageDoc } from "../documents.js"

const toDomain = (doc: WithId<MessageDoc>): MessageType => ({
  id: doc._id.toHexString(),
  chatId: doc.chatId.toHexString(),
  userId: doc.userId,
  role: doc.role,
  content: doc.content,
  status: doc.status,
  sources: doc.sources,
  ...(doc.provider ? { provider: doc.provider } : {}),
  ...(doc.model ? { model: doc.model } : {}),
  ...(doc.error ? { error: doc.error } : {}),
  createdAt: doc.createdAt,
  ...(doc.completedAt ? { completedAt: doc.completedAt } : {})
})

class MessageRepository implements IMessageRepository {
  private _collection: Collection<MessageDoc>

  constructor(db: Db) {
    this._collection = db.collection<MessageDoc>(Collections.MESSAGES)
  }

  async create(message: NewMessage): Promise<MessageType> {
    const chatId = toObjectId(message.chatId)
    if (!chatId) throw new ChatNotFoundError()

    const isActiveGeneration = message.role === MessageRole.ASSISTANT && message.status === MessageStatus.PENDING
    const doc: MessageDoc = {
      chatId,
      userId: message.userId,
      role: message.role,
      content: message.content,
      status: message.status,
      sources: [],
      ...(isActiveGeneration ? { active: true as const } : {}),
      createdAt: message.createdAt
    }

    try {
      const { insertedId } = await this._collection.insertOne(doc)
      return toDomain({ _id: insertedId, ...doc })
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ChatBusyError()
      throw error
    }
  }

  async findByIdAndChatId({
    id,
    chatId,
    userId
  }: {
    id: string
    chatId: string
    userId: string
  }): Promise<MessageType | null> {
    const _id = toObjectId(id)
    const chatObjectId = toObjectId(chatId)
    if (!_id || !chatObjectId) return null
    const doc = await this._collection.findOne({ _id, chatId: chatObjectId, userId })
    return doc ? toDomain(doc) : null
  }

  async listByChatId({ chatId, userId }: { chatId: string; userId: string }): Promise<MessageType[]> {
    const chatObjectId = toObjectId(chatId)
    if (!chatObjectId) return []
    const docs = await this._collection.find({ chatId: chatObjectId, userId }).sort({ createdAt: 1, _id: 1 }).toArray()
    return docs.map(toDomain)
  }

  async listHistory({
    chatId,
    before,
    limit
  }: {
    chatId: string
    before: Date
    limit: number
  }): Promise<MessageType[]> {
    const chatObjectId = toObjectId(chatId)
    if (!chatObjectId || limit <= 0) return []
    const docs = await this._collection
      .find({
        chatId: chatObjectId,
        createdAt: { $lt: before },
        $or: [{ role: MessageRole.USER }, { role: MessageRole.ASSISTANT, status: MessageStatus.DONE }]
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray()
    return docs.reverse().map(toDomain)
  }

  async getUserMessageUsageSince({
    userId,
    since
  }: {
    userId: string
    since: Date
  }): Promise<{ count: number; oldestAt: Date | null }> {
    const [usage] = await this._collection
      .aggregate<{ count: number; oldestAt: Date }>([
        { $match: { userId, role: MessageRole.USER, createdAt: { $gte: since } } },
        { $group: { _id: null, count: { $sum: 1 }, oldestAt: { $min: "$createdAt" } } }
      ])
      .toArray()
    return usage ? { count: usage.count, oldestAt: usage.oldestAt } : { count: 0, oldestAt: null }
  }

  async markStreaming({ id, provider, model }: { id: string; provider: string; model: string }): Promise<void> {
    const _id = toObjectId(id)
    if (!_id) return
    await this._collection.updateOne({ _id }, { $set: { status: MessageStatus.STREAMING, provider, model } })
  }

  async complete({
    id,
    content,
    sources
  }: {
    id: string
    content: string
    sources: MessageSourceType[]
  }): Promise<void> {
    const _id = toObjectId(id)
    if (!_id) return
    await this._collection.updateOne(
      { _id },
      { $set: { status: MessageStatus.DONE, content, sources, completedAt: new Date() }, $unset: { active: "" } }
    )
  }

  async fail({ id, error }: { id: string; error: string }): Promise<void> {
    const _id = toObjectId(id)
    if (!_id) return
    await this._collection.updateOne(
      { _id },
      { $set: { status: MessageStatus.FAILED, error, completedAt: new Date() }, $unset: { active: "" } }
    )
  }

  async failStale(): Promise<number> {
    const { modifiedCount } = await this._collection.updateMany(
      { active: true },
      {
        $set: { status: MessageStatus.FAILED, error: "Interrupted by a server restart", completedAt: new Date() },
        $unset: { active: "" }
      }
    )
    return modifiedCount
  }
}

export default MessageRepository
