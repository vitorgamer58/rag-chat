import { z } from "zod"

const StreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chunk"), seq: z.number().int().positive(), text: z.string() }),
  z.object({ type: z.literal("done"), content: z.string() }),
  z.object({ type: z.literal("failed"), message: z.string() })
])

export { StreamEvent }
export type StreamEventType = z.infer<typeof StreamEvent>
