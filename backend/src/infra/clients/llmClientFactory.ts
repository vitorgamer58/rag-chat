import { LLMProvider } from "../../domain/enums/LLMProvider.js"
import type { ILLMClient } from "../../domain/interfaces/clients.js"
import type { AppConfig } from "../config/index.js"
import KimiClient from "./KimiClient.js"
import MistralClient from "./MistralClient.js"

/** Builds only the client for the provider selected by LLM_PROVIDER. */
const createLLMClient = ({ llm }: Pick<AppConfig, "llm">): ILLMClient => {
  switch (llm.provider) {
    case LLMProvider.MISTRAL:
      return new MistralClient({ apiKey: llm.mistral.apiKey, model: llm.mistral.model, maxTokens: llm.maxTokens })
    case LLMProvider.KIMI: {
      if (!llm.kimi.apiKey) throw new Error("KIMI_API_KEY is required when LLM_PROVIDER is KIMI")
      return new KimiClient({
        apiKey: llm.kimi.apiKey,
        baseUrl: llm.kimi.baseUrl,
        model: llm.kimi.model,
        maxTokens: llm.maxTokens,
        reasoningEffort: llm.kimi.reasoningEffort
      })
    }
  }
}

export { createLLMClient }
