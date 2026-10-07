import "dotenv/config"
import GenerationOrchestrator from "./application/services/GenerationOrchestrator.js"
import PromptBuilder from "./application/services/PromptBuilder.js"
import RagRetriever from "./application/services/RagRetriever.js"
import CheckRateLimit from "./application/usecases/CheckRateLimit.js"
import CreateChat from "./application/usecases/CreateChat.js"
import GetChatMessages from "./application/usecases/GetChatMessages.js"
import ListChats from "./application/usecases/ListChats.js"
import RegisterUser from "./application/usecases/RegisterUser.js"
import SendMessage from "./application/usecases/SendMessage.js"
import StreamMessage from "./application/usecases/StreamMessage.js"
import { createLLMClient } from "./infra/clients/llmClientFactory.js"
import MistralEmbeddingClient from "./infra/clients/MistralEmbeddingClient.js"
import { loadConfig } from "./infra/config/index.js"
import { connectToMongo } from "./infra/database/connection.js"
import { ensureIndexes } from "./infra/database/ensureIndexes.js"
import ChatRepository from "./infra/database/repositories/ChatRepository.js"
import ChunkedDataRepository from "./infra/database/repositories/ChunkedDataRepository.js"
import ConfigRepository from "./infra/database/repositories/ConfigRepository.js"
import MessageChunkRepository from "./infra/database/repositories/MessageChunkRepository.js"
import MessageRepository from "./infra/database/repositories/MessageRepository.js"
import UserRepository from "./infra/database/repositories/UserRepository.js"
import { createApp } from "./infra/http/app.js"
import { createLogger } from "./infra/logger.js"
import InMemoryMessageBus from "./infra/messaging/InMemoryMessageBus.js"

const main = async () => {
  const config = loadConfig(process.env)
  const logger = createLogger(config.logLevel)

  const mongoClient = await connectToMongo(config.mongo.url)
  const db = mongoClient.db(config.mongo.dbName)
  await ensureIndexes(db)

  const userRepository = new UserRepository(db)
  const chatRepository = new ChatRepository(db)
  const messageRepository = new MessageRepository(db)
  const messageChunkRepository = new MessageChunkRepository(db)
  const configRepository = new ConfigRepository(db)
  const chunkedDataRepository = new ChunkedDataRepository(db, config.rag.vectorIndex)

  // The message bus is in-process, so generations left running by a previous process can never finish.
  const interrupted = await messageRepository.failStale()
  if (interrupted > 0) logger.warn({ interrupted }, "Marked interrupted generations as failed")

  const llmClient = createLLMClient(config)
  const embeddingClient = new MistralEmbeddingClient({
    apiKey: config.llm.mistral.apiKey,
    model: config.llm.mistral.embedModel
  })
  const messageBus = new InMemoryMessageBus(logger)

  const ragRetriever = new RagRetriever({
    embeddingClient,
    chunkedDataRepository,
    retrieveK: config.rag.retrieveK,
    scoreThreshold: config.rag.scoreThreshold
  })
  const generationOrchestrator = new GenerationOrchestrator({
    messageRepository,
    messageChunkRepository,
    configRepository,
    ragRetriever,
    promptBuilder: new PromptBuilder(),
    llmClient,
    messageBus,
    logger,
    historyMaxMessages: config.historyMaxMessages,
    generationTimeoutMs: config.llm.timeoutMs
  })
  const checkRateLimit = new CheckRateLimit({
    messageRepository,
    maxMessages: config.rateLimit.maxMessages,
    windowMinutes: config.rateLimit.windowMinutes
  })

  const app = createApp({
    registerUser: new RegisterUser({ userRepository }),
    createChat: new CreateChat({ chatRepository }),
    listChats: new ListChats({ chatRepository }),
    getChatMessages: new GetChatMessages({ chatRepository, messageRepository }),
    sendMessage: new SendMessage({ chatRepository, messageRepository, checkRateLimit, generationOrchestrator }),
    streamMessage: new StreamMessage({ messageRepository, messageChunkRepository, messageBus }),
    logger,
    corsOrigins: config.corsOrigins,
    maxMessageLength: config.maxMessageLength,
    sseHeartbeatMs: config.sseHeartbeatMs,
    ipRateLimit: config.ipRateLimit
  })

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { host: config.host, port: config.port, llmProvider: llmClient.provider, llmModel: llmClient.model },
      "Server started"
    )
  })

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, "Shutting down")
    server.close()
    server.closeAllConnections()
    try {
      await messageRepository.failStale()
      await mongoClient.close()
    } finally {
      process.exit(0)
    }
  }
  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
