import type { ChatType } from "../../domain/entities/Chat.js"
import type { IChatRepository } from "../../domain/interfaces/repositories.js"
import type { IUseCase } from "../../domain/interfaces/usecases.js"

type ListChatsParams = { userId: string; limit: number; before?: Date | undefined }

class ListChats implements IUseCase<ListChatsParams, ChatType[]> {
  private _chatRepository: IChatRepository

  constructor({ chatRepository }: { chatRepository: IChatRepository }) {
    this._chatRepository = chatRepository
  }

  async execute({ userId, limit, before }: ListChatsParams): Promise<ChatType[]> {
    return await this._chatRepository.listByUserId({ userId, limit, before })
  }
}

export default ListChats
