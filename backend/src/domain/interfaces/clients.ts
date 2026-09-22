import type { LLMMessageType } from "../entities/LLMMessage.js"

export interface ILLMClient {
  readonly provider: string
  readonly model: string
  /** Yields only the final answer text; any provider reasoning output must be discarded. */
  stream(messages: LLMMessageType[], signal?: AbortSignal): AsyncIterable<string>
}

export interface IEmbeddingClient {
  embed(text: string): Promise<number[]>
}
