export const LLMProvider = {
  KIMI: "KIMI",
  MISTRAL: "MISTRAL"
} as const

export type LLMProviderType = (typeof LLMProvider)[keyof typeof LLMProvider]
