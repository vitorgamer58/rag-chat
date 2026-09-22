import { Router } from "express"
import { z } from "zod"
import type GetChatMessages from "../../../application/usecases/GetChatMessages.js"
import type SendMessage from "../../../application/usecases/SendMessage.js"
import type StreamMessage from "../../../application/usecases/StreamMessage.js"
import { getUser } from "../context.js"
import { presentMessage } from "../presenters.js"
import { openSse } from "../sse.js"

const ChatParams = z.object({ chatId: z.string() })
const MessageParams = ChatParams.extend({ messageId: z.string() })

/** `Last-Event-ID` header (sent by EventSource on reconnect) or `lastEventId` query param (first manual resume). */
const parseLastEventId = (header: string | undefined, query: unknown): number => {
  const raw = header ?? (typeof query === "string" ? query : undefined)
  const parsed = raw === undefined ? 0 : Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** Mounted at /api/chats/:chatId/messages. */
const messagesRouter = ({
  getChatMessages,
  sendMessage,
  streamMessage,
  maxMessageLength,
  sseHeartbeatMs
}: {
  getChatMessages: GetChatMessages
  sendMessage: SendMessage
  streamMessage: StreamMessage
  maxMessageLength: number
  sseHeartbeatMs: number
}): Router => {
  const router = Router({ mergeParams: true })
  const SendMessageBody = z.object({ content: z.string().trim().min(1).max(maxMessageLength) })

  router.get("/", async (req, res) => {
    const { chatId } = ChatParams.parse(req.params)
    const messages = await getChatMessages.execute({ userId: getUser(res).fingerprint, chatId })
    res.json({ messages: messages.map(presentMessage) })
  })

  // Starts the generation and returns right away; the answer is read from the stream endpoint below.
  router.post("/", async (req, res) => {
    const { chatId } = ChatParams.parse(req.params)
    const { content } = SendMessageBody.parse(req.body)
    const result = await sendMessage.execute({ userId: getUser(res).fingerprint, chatId, content })
    res.status(202).json(result)
  })

  router.get("/:messageId/stream", async (req, res) => {
    const { chatId, messageId } = MessageParams.parse(req.params)

    const clientGone = new AbortController()
    res.on("close", () => clientGone.abort())

    // Resolved before any header is written, so ownership/not-found errors still become proper HTTP responses.
    const events = await streamMessage.execute({
      userId: getUser(res).fingerprint,
      chatId,
      messageId,
      lastEventId: parseLastEventId(req.get("last-event-id"), req.query["lastEventId"]),
      signal: clientGone.signal
    })

    const sse = openSse(res, sseHeartbeatMs)
    for await (const event of events) {
      sse.send(event)
    }
    sse.end()
  })

  return router
}

export { messagesRouter }
