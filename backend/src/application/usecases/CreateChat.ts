import type { ChatType } from "../../domain/entities/Chat.js"
import type { IChatRepository } from "../../domain/interfaces/repositories.js"
import type { IUseCase } from "../../domain/interfaces/usecases.js"

class CreateChat implements IUseCase<{ userId: string }, ChatType> {
  private _chatRepository: IChatRepository

  constructor({ chatRepository }: { chatRepository: IChatRepository }) {
    this._chatRepository = chatRepository
  }

  async execute({ userId }: { userId: string }): Promise<ChatType> {
    return await this._chatRepository.create({ userId })
  }
}

export default CreateChat
