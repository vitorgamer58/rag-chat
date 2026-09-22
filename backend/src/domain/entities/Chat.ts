import { z } from "zod"

const Chat = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export { Chat }
export type ChatType = z.infer<typeof Chat>
