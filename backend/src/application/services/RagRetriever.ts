import type { RetrievedChunkType } from "../../domain/entities/RetrievedChunk.js"
import type { IEmbeddingClient } from "../../domain/interfaces/clients.js"
import type { IChunkedDataRepository } from "../../domain/interfaces/repositories.js"

class RagRetriever {
  private _embeddingClient: IEmbeddingClient
  private _chunkedDataRepository: IChunkedDataRepository
  private _retrieveK: number
  private _numCandidates: number
  private _scoreThreshold: number

  constructor({
    embeddingClient,
    chunkedDataRepository,
    retrieveK,
    scoreThreshold
  }: {
    embeddingClient: IEmbeddingClient
    chunkedDataRepository: IChunkedDataRepository
    retrieveK: number
    scoreThreshold: number
  }) {
    this._embeddingClient = embeddingClient
    this._chunkedDataRepository = chunkedDataRepository
    this._retrieveK = retrieveK
    this._numCandidates = Math.max(100, retrieveK * 20)
    this._scoreThreshold = scoreThreshold
  }

  async retrieve(query: string): Promise<RetrievedChunkType[]> {
    const queryVector = await this._embeddingClient.embed(query)
    const chunks = await this._chunkedDataRepository.vectorSearch({
      queryVector,
      limit: this._retrieveK,
      numCandidates: this._numCandidates
    })
    return chunks.filter((chunk) => chunk.score >= this._scoreThreshold)
  }
}

export default RagRetriever
