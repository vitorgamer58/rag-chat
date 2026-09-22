import { ChatNotFoundError } from "../../domain/errors/ChatNotFoundError.js"
import { MessageRole } from "../../domain/enums/MessageRole.js"
import { MessageStatus } from "../../domain/enums/MessageStatus.js"
import type { IChatRepository, IMessageRepository } from "../../domain/interfaces/repositories.js"
import type { IUseCase } from "../../domain/interfaces/usecases.js"
import type CheckRateLimit from "./CheckRateLimit.js"
import type GenerationOrchestrator from "../services/GenerationOrchestrator.js"

type SendMessageParams = { userId: string; chatId: string; content: string }
type SendMessageResult = { userMessageId: string; assistantMessageId: string }

const MAX_TITLE_LENGTH = 80

const buildTitle = (content: string): string => {
  const singleLine = content.replace(/\s+/g, " ").trim()
  return singleLine.length > MAX_TITLE_LENGTH ? `${singleLine.slice(0, MAX_TITLE_LENGTH - 1)}…` : singleLine
}

class SendMessage implements IUseCase<SendMessageParams, SendMessageResult> {
  private _chatRepository: IChatRepository
  private _messageRepository: IMessageRepository
  private _checkRateLimit: CheckRateLimit
  private _generationOrchestrator: GenerationOrchestrator

  constructor({
    chatRepository,
    messageRepository,
    checkRateLimit,
    generationOrchestrator
  }: {
    chatRepository: IChatRepository
    messageRepository: IMessageRepository
    checkRateLimit: CheckRateLimit
    generationOrchestrator: GenerationOrchestrator
  }) {
    this._chatRepository = chatRepository
    this._messageRepository = messageRepository
    this._checkRateLimit = checkRateLimit
    this._generationOrchestrator = generationOrchestrator
  }

  async execute({ userId, chatId, content }: SendMessageParams): Promise<SendMessageResult> {
    const chat = await this._chatRepository.findByIdAndUserId({ id: chatId, userId })
    if (!chat) throw new ChatNotFoundError()

    await this._checkRateLimit.execute({ userId })

    // The assistant placeholder goes first: it is the chat's single active generation, so the database rejects
    // (ChatBusyError) a concurrent send before the user message exists and is counted by the rate limit.
    const questionCreatedAt = new Date()
    const assistantMessage = await this._messageRepository.create({
      chatId,
      userId,
      role: MessageRole.ASSISTANT,
      content: "",
      status: MessageStatus.PENDING,
      createdAt: new Date(questionCreatedAt.getTime() + 1)
    })

    let userMessageId: string
    try {
      const userMessage = await this._messageRepository.create({
        chatId,
        userId,
        role: MessageRole.USER,
        content,
        status: MessageStatus.DONE,
        createdAt: questionCreatedAt
      })
      userMessageId = userMessage.id
    } catch (error) {
      await this._messageRepository.fail({ id: assistantMessage.id, error: "Could not save the user message" })
      throw error
    }

    await this._chatRepository.setTitleIfUntitled({ id: chatId, title: buildTitle(content) })
    await this._chatRepository.touch(chatId)

    this._generationOrchestrator.start({
      chatId,
      assistantMessageId: assistantMessage.id,
      question: content,
      questionCreatedAt
    })

    return { userMessageId, assistantMessageId: assistantMessage.id }
  }
}

export default SendMessage
