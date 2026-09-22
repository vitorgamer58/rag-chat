import { z } from "zod"

const MessageChunk = z.object({
  messageId: z.string(),
  seq: z.number().int().positive(),
  text: z.string(),
  createdAt: z.date()
})

export { MessageChunk }
export type MessageChunkType = z.infer<typeof MessageChunk>
