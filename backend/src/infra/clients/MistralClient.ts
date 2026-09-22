import { Mistral } from "@mistralai/mistralai"
import type { LLMMessageType } from "../../domain/entities/LLMMessage.js"
import type { ILLMClient } from "../../domain/interfaces/clients.js"

type MistralStreamRequest = Parameters<Mistral["chat"]["stream"]>[0]
type MistralDeltaContent = string | { type: string; text?: string }[] | null | undefined

const TEMPERATURE = 0.5

/** Text of a streamed delta; non-text chunks (e.g. the thinking of reasoning models) are ignored. */
const extractText = (content: MistralDeltaContent): string => {
  if (!content) return ""
  if (typeof content === "string") return content
  return content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("")
}

class MistralClient implements ILLMClient {
  readonly provider = "MISTRAL"
  readonly model: string
  private _client: Mistral
  private _maxTokens: number

  constructor({ apiKey, model, maxTokens }: { apiKey: string; model: string; maxTokens: number }) {
    this._client = new Mistral({ apiKey })
    this.model = model
    this._maxTokens = maxTokens
  }

  async *stream(messages: LLMMessageType[], signal?: AbortSignal): AsyncGenerator<string> {
    const stream = await this._client.chat.stream(
      {
        model: this.model,
        messages: messages as MistralStreamRequest["messages"],
        temperature: TEMPERATURE,
        maxTokens: this._maxTokens
      },
      signal ? { signal } : {}
    )

    for await (const event of stream) {
      const text = extractText(event.data.choices[0]?.delta.content)
      if (text) yield text
    }
  }
}

export default MistralClient
export { extractText }
