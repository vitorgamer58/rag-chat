import type { Collection, Db } from "mongodb"
import type { ConfigKeyType } from "../../../domain/enums/ConfigKey.js"
import { ConfigNotFoundError } from "../../../domain/errors/ConfigNotFoundError.js"
import type { IConfigRepository } from "../../../domain/interfaces/repositories.js"
import { Collections, type ConfigDoc } from "../documents.js"

/** Reads prompts from the database, cached briefly so they can be edited without a redeploy or a query per message. */
class ConfigRepository implements IConfigRepository {
  private _collection: Collection<ConfigDoc>
  private _cacheTtlMs: number
  private _cache = new Map<string, { value: string; expiresAt: number }>()

  constructor(db: Db, cacheTtlMs = 60_000) {
    this._collection = db.collection<ConfigDoc>(Collections.APP_CONFIG)
    this._cacheTtlMs = cacheTtlMs
  }

  async getValue(key: ConfigKeyType): Promise<string> {
    const cached = this._cache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const doc = await this._collection.findOne({ key })
    if (!doc) throw new ConfigNotFoundError(key)

    this._cache.set(key, { value: doc.value, expiresAt: Date.now() + this._cacheTtlMs })
    return doc.value
  }
}

export default ConfigRepository
