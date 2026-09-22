import { z } from "zod"
import { MessageSource } from "./Message.js"

const StreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chunk"), seq: z.number().int().positive(), text: z.string() }),
  z.object({ type: z.literal("done"), content: z.string(), sources: z.array(MessageSource) }),
  z.object({ type: z.literal("failed"), message: z.string() })
])

export { StreamEvent }
export type StreamEventType = z.infer<typeof StreamEvent>
