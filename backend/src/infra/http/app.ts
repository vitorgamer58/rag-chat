import cors from "cors"
import express, { type Express } from "express"
import helmet from "helmet"
import type CreateChat from "../../application/usecases/CreateChat.js"
import type GetChatMessages from "../../application/usecases/GetChatMessages.js"
import type ListChats from "../../application/usecases/ListChats.js"
import type RegisterUser from "../../application/usecases/RegisterUser.js"
import type SendMessage from "../../application/usecases/SendMessage.js"
import type StreamMessage from "../../application/usecases/StreamMessage.js"
import type { ILogger } from "../../domain/interfaces/services.js"
import { createIpRateLimiters, type IpRateLimitOptions } from "./middlewares/ipRateLimit.js"
import { allowQueryFingerprint, fingerprint } from "./middlewares/fingerprint.js"
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js"
import { registerUser } from "./middlewares/registerUser.js"
import { requestLogger } from "./middlewares/requestLogger.js"
import { chatsRouter } from "./routes/chats.js"
import { messagesRouter } from "./routes/messages.js"

type AppDependencies = {
  registerUser: RegisterUser
  createChat: CreateChat
  listChats: ListChats
  getChatMessages: GetChatMessages
  sendMessage: SendMessage
  streamMessage: StreamMessage
  logger: ILogger
  corsOrigins: string[]
  maxMessageLength: number
  sseHeartbeatMs: number
  ipRateLimit?: IpRateLimitOptions
}

const createApp = (deps: AppDependencies): Express => {
  const app = express()
  app.disable("x-powered-by")
  // The only hop in front of the app is Apache on loopback; it overwrites X-Forwarded-For with the real client IP.
  app.set("trust proxy", "loopback")

  // JSON/SSE API: the frontend CSP is served by the static host. CORP is relaxed because the SPA lives on another origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))
  app.use(
    cors({
      origin: deps.corsOrigins.includes("*") ? "*" : deps.corsOrigins,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Fingerprint", "Last-Event-ID"],
      maxAge: 600
    })
  )
  app.use(requestLogger(deps.logger))
  app.use(express.json({ limit: "32kb" }))

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  // Per-IP limits run before the fingerprint/user upsert, so rotating X-Fingerprint neither bypasses them nor creates
  // users for free.
  const ipLimiters = createIpRateLimiters(deps.ipRateLimit)
  app.use("/api", ipLimiters.general)
  app.post("/api/chats", ipLimiters.write)
  app.post("/api/chats/:chatId/messages", ipLimiters.write)
  app.use("/api/chats/:chatId/messages/:messageId/stream", ipLimiters.stream)

  // Must come before the fingerprint middleware: EventSource cannot send the X-Fingerprint header.
  app.use("/api/chats/:chatId/messages/:messageId/stream", allowQueryFingerprint())
  app.use("/api", fingerprint(), registerUser({ registerUser: deps.registerUser }))

  app.use("/api/chats", chatsRouter({ createChat: deps.createChat, listChats: deps.listChats }))
  app.use(
    "/api/chats/:chatId/messages",
    messagesRouter({
      getChatMessages: deps.getChatMessages,
      sendMessage: deps.sendMessage,
      streamMessage: deps.streamMessage,
      maxMessageLength: deps.maxMessageLength,
      sseHeartbeatMs: deps.sseHeartbeatMs
    })
  )

  app.use(notFoundHandler())
  app.use(errorHandler(deps.logger))

  return app
}

export { createApp }
export type { AppDependencies }
