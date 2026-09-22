import { z } from "zod"

const RetrievedChunk = z.object({
  title: z.string(),
  chunkIndex: z.number().int(),
  text: z.string(),
  score: z.number()
})

export { RetrievedChunk }
export type RetrievedChunkType = z.infer<typeof RetrievedChunk>
