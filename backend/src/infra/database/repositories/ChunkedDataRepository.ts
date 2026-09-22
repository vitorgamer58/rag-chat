import type { Collection, Db } from "mongodb"
import type { RetrievedChunkType } from "../../../domain/entities/RetrievedChunk.js"
import type { IChunkedDataRepository } from "../../../domain/interfaces/repositories.js"
import { Collections, type ChunkedDataDoc } from "../documents.js"

type VectorSearchRow = { title: string; chunk_index: number; text: string; score: number }

class ChunkedDataRepository implements IChunkedDataRepository {
  private _collection: Collection<ChunkedDataDoc>
  private _vectorIndex: string

  constructor(db: Db, vectorIndex: string) {
    this._collection = db.collection<ChunkedDataDoc>(Collections.CHUNKED_DATA)
    this._vectorIndex = vectorIndex
  }

  /** `score` is Atlas' `vectorSearchScore`; for cosine similarity it is normalized to (1 + cosine) / 2. */
  async vectorSearch({
    queryVector,
    limit,
    numCandidates
  }: {
    queryVector: number[]
    limit: number
    numCandidates: number
  }): Promise<RetrievedChunkType[]> {
    const rows = await this._collection
      .aggregate<VectorSearchRow>([
        { $vectorSearch: { index: this._vectorIndex, path: "embedding", queryVector, numCandidates, limit } },
        { $project: { _id: 0, title: 1, chunk_index: 1, text: 1, score: { $meta: "vectorSearchScore" } } }
      ])
      .toArray()

    return rows.map((row) => ({
      title: row.title,
      chunkIndex: row.chunk_index,
      text: row.text,
      score: row.score
    }))
  }
}

export default ChunkedDataRepository
