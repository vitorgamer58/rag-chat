import { z } from "zod"
import { MessageRole } from "../enums/MessageRole.js"
import { MessageStatus } from "../enums/MessageStatus.js"

const MessageSource = z.object({
  title: z.string(),
  chunkIndex: z.number().int(),
  score: z.number()
})

const Message = z.object({
  id: z.string(),
  chatId: z.string(),
  userId: z.string(),
  role: z.enum(MessageRole),
  content: z.string(),
  status: z.enum(MessageStatus),
  sources: z.array(MessageSource),
  provider: z.string().optional(),
  model: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  completedAt: z.date().optional()
})

export { Message, MessageSource }
export type MessageType = z.infer<typeof Message>
export type MessageSourceType = z.infer<typeof MessageSource>
