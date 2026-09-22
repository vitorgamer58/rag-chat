import OpenAI from "openai"
import type { LLMMessageType } from "../../domain/entities/LLMMessage.js"
import type { ILLMClient } from "../../domain/interfaces/clients.js"

type ReasoningEffort = "low" | "high" | "max"

/**
 * Kimi K3 through its OpenAI-compatible endpoint. K3 always thinks and fixes temperature/top_p/n/penalties, so we
 * send none of them, and only `delta.content` is forwarded (`delta.reasoning_content` is the model's thinking).
 */
class KimiClient implements ILLMClient {
  readonly provider = "KIMI"
  readonly model: string
  private _client: OpenAI
  private _maxTokens: number
  private _reasoningEffort: ReasoningEffort | undefined

  constructor({
    apiKey,
    baseUrl,
    model,
    maxTokens,
    reasoningEffort
  }: {
    apiKey: string
    baseUrl: string
    model: string
    maxTokens: number
    reasoningEffort?: ReasoningEffort | undefined
  }) {
    this._client = new OpenAI({ apiKey, baseURL: baseUrl })
    this.model = model
    this._maxTokens = maxTokens
    this._reasoningEffort = reasoningEffort
  }

  async *stream(messages: LLMMessageType[], signal?: AbortSignal): AsyncGenerator<string> {
    const stream = await this._client.chat.completions.create(
      {
        model: this.model,
        messages,
        stream: true,
        max_completion_tokens: this._maxTokens,
        ...(this._reasoningEffort ? { reasoning_effort: this._reasoningEffort } : {})
      },
      signal ? { signal } : {}
    )

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) yield content
    }
  }
}

export default KimiClient
