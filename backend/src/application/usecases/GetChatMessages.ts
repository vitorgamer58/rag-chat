import type { MessageType } from "../../domain/entities/Message.js"
import { ChatNotFoundError } from "../../domain/errors/ChatNotFoundError.js"
import type { IChatRepository, IMessageRepository } from "../../domain/interfaces/repositories.js"
import type { IUseCase } from "../../domain/interfaces/usecases.js"

type GetChatMessagesParams = { userId: string; chatId: string }

class GetChatMessages implements IUseCase<GetChatMessagesParams, MessageType[]> {
  private _chatRepository: IChatRepository
  private _messageRepository: IMessageRepository

  constructor({
    chatRepository,
    messageRepository
  }: {
    chatRepository: IChatRepository
    messageRepository: IMessageRepository
  }) {
    this._chatRepository = chatRepository
    this._messageRepository = messageRepository
  }

  async execute({ userId, chatId }: GetChatMessagesParams): Promise<MessageType[]> {
    const chat = await this._chatRepository.findByIdAndUserId({ id: chatId, userId })
    if (!chat) throw new ChatNotFoundError()
    return await this._messageRepository.listByChatId({ chatId, userId })
  }
}

export default GetChatMessages
