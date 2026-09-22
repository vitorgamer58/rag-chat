import { Router } from "express"
import { z } from "zod"
import type CreateChat from "../../../application/usecases/CreateChat.js"
import type ListChats from "../../../application/usecases/ListChats.js"
import { getUser } from "../context.js"
import { presentChat } from "../presenters.js"

const ListChatsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.coerce.date().optional()
})

const chatsRouter = ({ createChat, listChats }: { createChat: CreateChat; listChats: ListChats }): Router => {
  const router = Router()

  router.post("/", async (_req, res) => {
    const chat = await createChat.execute({ userId: getUser(res).fingerprint })
    res.status(201).json({ chat: presentChat(chat) })
  })

  router.get("/", async (req, res) => {
    const { limit, before } = ListChatsQuery.parse(req.query)
    const chats = await listChats.execute({ userId: getUser(res).fingerprint, limit, before })
    res.json({ chats: chats.map(presentChat) })
  })

  return router
}

export { chatsRouter }
