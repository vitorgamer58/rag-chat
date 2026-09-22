import { Mistral } from "@mistralai/mistralai"
import type { IEmbeddingClient } from "../../domain/interfaces/clients.js"

class MistralEmbeddingClient implements IEmbeddingClient {
  private _client: Mistral
  private _model: string

  constructor({ apiKey, model }: { apiKey: string; model: string }) {
    this._client = new Mistral({ apiKey })
    this._model = model
  }

  async embed(text: string): Promise<number[]> {
    const response = await this._client.embeddings.create({ model: this._model, inputs: [text] })
    const embedding = response.data[0]?.embedding
    if (!embedding?.length) throw new Error("Mistral returned an empty embedding")
    return embedding
  }
}

export default MistralEmbeddingClient
