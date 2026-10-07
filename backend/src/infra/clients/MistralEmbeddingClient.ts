import { Mistral } from "@mistralai/mistralai"
import type { IEmbeddingClient } from "../../domain/interfaces/clients.js"

class MistralEmbeddingClient implements IEmbeddingClient {
  private _client: Mistral
  private _model: string
  private _timeoutMs: number

  constructor({ apiKey, model, timeoutMs }: { apiKey: string; model: string; timeoutMs: number }) {
    this._client = new Mistral({ apiKey })
    this._model = model
    this._timeoutMs = timeoutMs
  }

  async embed(text: string): Promise<number[]> {
    const response = await this._client.embeddings.create(
      { model: this._model, inputs: [text] },
      { timeoutMs: this._timeoutMs }
    )
    const embedding = response.data[0]?.embedding
    if (!embedding?.length) throw new Error("Mistral returned an empty embedding")
    return embedding
  }
}

export default MistralEmbeddingClient
