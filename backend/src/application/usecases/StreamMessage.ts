import type { MessageType } from "../../domain/entities/Message.js"
import type { StreamEventType } from "../../domain/entities/StreamEvent.js"
import { MessageRole } from "../../domain/enums/MessageRole.js"
import { MessageStatus } from "../../domain/enums/MessageStatus.js"
import { MessageNotFoundError } from "../../domain/errors/MessageNotFoundError.js"
import type { IMessageChunkRepository, IMessageRepository } from "../../domain/interfaces/repositories.js"
import type { IMessageBus } from "../../domain/interfaces/services.js"
import type { IUseCase } from "../../domain/interfaces/usecases.js"
import { GENERATION_FAILED_MESSAGE } from "../constants.js"
import { AsyncQueue } from "../services/AsyncQueue.js"

type ChunkEvent = Extract<StreamEventType, { type: "chunk" }>

type StreamMessageParams = {
  userId: string
  chatId: string
  messageId: string
  /** `seq` of the last chunk the client already received (SSE `Last-Event-ID`); 0 to start from the beginning. */
  lastEventId: number
  signal?: AbortSignal | undefined
}

/**
 * Replays the chunks a client missed and then follows the generation live until it ends. Ordering guarantee: the
 * orchestrator persists a chunk before publishing it, and we subscribe before reading the database, so no chunk can
 * fall between the replay and the live phase (duplicates are dropped by `seq`).
 */
class StreamMessage implements IUseCase<StreamMessageParams, AsyncGenerator<StreamEventType>> {
  private _messageRepository: IMessageRepository
  private _messageChunkRepository: IMessageChunkRepository
  private _messageBus: IMessageBus

  constructor({
    messageRepository,
    messageChunkRepository,
    messageBus
  }: {
    messageRepository: IMessageRepository
    messageChunkRepository: IMessageChunkRepository
    messageBus: IMessageBus
  }) {
    this._messageRepository = messageRepository
    this._messageChunkRepository = messageChunkRepository
    this._messageBus = messageBus
  }

  /** Validates access eagerly, so callers can still answer with a proper HTTP error before starting the stream. */
  async execute(params: StreamMessageParams): Promise<AsyncGenerator<StreamEventType>> {
    const message = await this.findAssistantMessage(params)
    return this.stream(params, message)
  }

  private async findAssistantMessage({ userId, chatId, messageId }: StreamMessageParams): Promise<MessageType> {
    const message = await this._messageRepository.findByIdAndChatId({ id: messageId, chatId, userId })
    if (!message || message.role !== MessageRole.ASSISTANT) throw new MessageNotFoundError()
    return message
  }

  private async listChunkEvents(messageId: string, afterSeq: number): Promise<ChunkEvent[]> {
    const chunks = await this._messageChunkRepository.listAfter({ messageId, afterSeq })
    return chunks.map((chunk) => ({ type: "chunk", seq: chunk.seq, text: chunk.text }))
  }

  private async *stream(params: StreamMessageParams, initialMessage: MessageType): AsyncGenerator<StreamEventType> {
    const { messageId, signal } = params
    const queue = new AsyncQueue<StreamEventType>()
    const unsubscribe = this._messageBus.subscribe(messageId, (event) => queue.push(event))
    const onAbort = () => queue.close()
    signal?.addEventListener("abort", onAbort, { once: true })

    try {
      let lastSeq = Number.isFinite(params.lastEventId) ? Math.max(0, params.lastEventId) : 0

      for (const event of await this.listChunkEvents(messageId, lastSeq)) {
        lastSeq = event.seq
        yield event
      }

      const current =
        (await this._messageRepository.findByIdAndChatId({
          id: messageId,
          chatId: params.chatId,
          userId: params.userId
        })) ?? initialMessage
      if (current.status === MessageStatus.DONE || current.status === MessageStatus.FAILED) {
        // The generation may have finished while we were replaying: pick up whatever was persisted in the meantime.
        for (const event of await this.listChunkEvents(messageId, lastSeq)) {
          yield event
        }
        yield current.status === MessageStatus.DONE
          ? { type: "done", content: current.content, sources: current.sources }
          : { type: "failed", message: GENERATION_FAILED_MESSAGE }
        return
      }

      for await (const event of queue) {
        if (event.type === "chunk") {
          if (event.seq <= lastSeq) continue
          lastSeq = event.seq
          yield event
          continue
        }
        yield event
        return
      }
    } finally {
      unsubscribe()
      signal?.removeEventListener("abort", onAbort)
      queue.close()
    }
  }
}

export default StreamMessage
