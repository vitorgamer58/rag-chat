import { z } from "zod"

const LLMMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string()
})

export { LLMMessage }
export type LLMMessageType = z.infer<typeof LLMMessage>
