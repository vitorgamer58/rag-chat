import { ConfigKey } from "../../domain/enums/ConfigKey.js"
import type { ILLMClient } from "../../domain/interfaces/clients.js"
import type {
  IConfigRepository,
  IMessageChunkRepository,
  IMessageRepository
} from "../../domain/interfaces/repositories.js"
import type { ILogger, IMessageBus } from "../../domain/interfaces/services.js"
import { GENERATION_FAILED_MESSAGE } from "../constants.js"
import { ChunkBatcher } from "./ChunkBatcher.js"
import type PromptBuilder from "./PromptBuilder.js"
import type RagRetriever from "./RagRetriever.js"

type GenerationParams = {
  chatId: string
  assistantMessageId: string
  question: string
  /** History only includes messages created before this instant (the current question is sent separately). */
  questionCreatedAt: Date
}

const MAX_STORED_ERROR_LENGTH = 500

/**
 * Generates an answer in the background, decoupled from any HTTP connection: every batch of text is persisted (so a
 * client that lost its connection can replay what it missed) and then published to whoever is listening live.
 */
class GenerationOrchestrator {
  private _messageRepository: IMessageRepository
  private _messageChunkRepository: IMessageChunkRepository
  private _configRepository: IConfigRepository
  private _ragRetriever: RagRetriever
  private _promptBuilder: PromptBuilder
  private _llmClient: ILLMClient
  private _messageBus: IMessageBus
  private _logger: ILogger
  private _historyMaxMessages: number
  private _generationTimeoutMs: number
  private _flushIntervalMs: number
  private _maxBufferChars: number

  constructor({
    messageRepository,
    messageChunkRepository,
    configRepository,
    ragRetriever,
    promptBuilder,
    llmClient,
    messageBus,
    logger,
    historyMaxMessages,
    generationTimeoutMs,
    flushIntervalMs = 200,
    maxBufferChars = 200
  }: {
    messageRepository: IMessageRepository
    messageChunkRepository: IMessageChunkRepository
    configRepository: IConfigRepository
    ragRetriever: RagRetriever
    promptBuilder: PromptBuilder
    llmClient: ILLMClient
    messageBus: IMessageBus
    logger: ILogger
    historyMaxMessages: number
    generationTimeoutMs: number
    flushIntervalMs?: number
    maxBufferChars?: number
  }) {
    this._messageRepository = messageRepository
    this._messageChunkRepository = messageChunkRepository
    this._configRepository = configRepository
    this._ragRetriever = ragRetriever
    this._promptBuilder = promptBuilder
    this._llmClient = llmClient
    this._messageBus = messageBus
    this._logger = logger
    this._historyMaxMessages = historyMaxMessages
    this._generationTimeoutMs = generationTimeoutMs
    this._flushIntervalMs = flushIntervalMs
    this._maxBufferChars = maxBufferChars
  }

  /** Fire and forget: the returned work never rejects, failures are recorded on the message. */
  start(params: GenerationParams): void {
    void this.run(params)
  }

  async run({ chatId, assistantMessageId, question, questionCreatedAt }: GenerationParams): Promise<void> {
    try {
      await this._messageRepository.markStreaming({
        id: assistantMessageId,
        provider: this._llmClient.provider,
        model: this._llmClient.model
      })

      const [chunks, systemPrompt, userMessageTemplate, contextTemplate, history] = await Promise.all([
        this._ragRetriever.retrieve(question),
        this._configRepository.getValue(ConfigKey.SYSTEM_PROMPT),
        this._configRepository.getValue(ConfigKey.USER_MESSAGE_TEMPLATE),
        this._configRepository.getValue(ConfigKey.CONTEXT_TEMPLATE),
        this._messageRepository.listHistory({
          chatId,
          before: questionCreatedAt,
          limit: this._historyMaxMessages
        })
      ])

      const messages = this._promptBuilder.build({
        systemPrompt,
        userMessageTemplate,
        contextTemplate,
        history,
        question,
        chunks
      })

      const batcher = new ChunkBatcher({
        flushIntervalMs: this._flushIntervalMs,
        maxBufferChars: this._maxBufferChars,
        onFlush: async ({ seq, text }) => {
          await this._messageChunkRepository.insert({ messageId: assistantMessageId, seq, text })
          this._messageBus.publish(assistantMessageId, { type: "chunk", seq, text })
        }
      })

      let content = ""
      const signal = AbortSignal.timeout(this._generationTimeoutMs)
      try {
        for await (const token of this._llmClient.stream(messages, signal)) {
          if (batcher.error) break
          content += token
          batcher.push(token)
        }
      } finally {
        await batcher.close().catch(() => undefined)
      }
      if (batcher.error) throw batcher.error

      if (!content.trim()) throw new Error("The LLM returned an empty response")

      await this._messageRepository.complete({
        id: assistantMessageId,
        content,
        sources: chunks.map(({ title, chunkIndex, score }) => ({ title, chunkIndex, score }))
      })
      this._messageBus.publish(assistantMessageId, { type: "done", content })
    } catch (error) {
      await this.fail(assistantMessageId, error)
    }
  }

  private async fail(assistantMessageId: string, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error)
    this._logger.error({ err: error, messageId: assistantMessageId }, "Generation failed")
    try {
      await this._messageRepository.fail({ id: assistantMessageId, error: reason.slice(0, MAX_STORED_ERROR_LENGTH) })
    } catch (persistError) {
      this._logger.error({ err: persistError, messageId: assistantMessageId }, "Could not mark the message as failed")
    }
    this._messageBus.publish(assistantMessageId, { type: "failed", message: GENERATION_FAILED_MESSAGE })
  }
}

export default GenerationOrchestrator
