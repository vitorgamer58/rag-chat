import type { Collection, Db, WithId } from "mongodb"
import type { UserType } from "../../../domain/entities/User.js"
import type { IUserRepository } from "../../../domain/interfaces/repositories.js"
import { Collections, isDuplicateKeyError, type UserDoc } from "../documents.js"

const toDomain = (doc: WithId<UserDoc>): UserType => ({
  id: doc._id.toHexString(),
  fingerprint: doc.fingerprint,
  createdAt: doc.createdAt,
  lastSeenAt: doc.lastSeenAt,
  ...(doc.lastIp ? { lastIp: doc.lastIp } : {})
})

class UserRepository implements IUserRepository {
  private _collection: Collection<UserDoc>

  constructor(db: Db) {
    this._collection = db.collection<UserDoc>(Collections.USERS)
  }

  async upsertByFingerprint({
    fingerprint,
    lastIp
  }: {
    fingerprint: string
    lastIp?: string | undefined
  }): Promise<UserType> {
    const now = new Date()
    const update = {
      $set: { lastSeenAt: now, ...(lastIp ? { lastIp } : {}) },
      $setOnInsert: { createdAt: now }
    }

    try {
      return toDomain(await this.upsert(fingerprint, update))
    } catch (error) {
      // Two first requests of the same new user can race on the unique index; the loser just needs to update.
      if (!isDuplicateKeyError(error)) throw error
      return toDomain(await this.upsert(fingerprint, update))
    }
  }

  private async upsert(
    fingerprint: string,
    update: { $set: Partial<UserDoc>; $setOnInsert: Pick<UserDoc, "createdAt"> }
  ): Promise<WithId<UserDoc>> {
    const doc = await this._collection.findOneAndUpdate({ fingerprint }, update, {
      upsert: true,
      returnDocument: "after"
    })
    if (!doc) throw new Error("User upsert did not return a document")
    return doc
  }
}

export default UserRepository
