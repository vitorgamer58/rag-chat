import type { ChatType } from "../../domain/entities/Chat.js"
import type { MessageType } from "../../domain/entities/Message.js"

const presentChat = (chat: ChatType) => ({
  id: chat.id,
  title: chat.title,
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt
})

const presentMessage = (message: MessageType) => ({
  id: message.id,
  chatId: message.chatId,
  role: message.role,
  content: message.content,
  status: message.status,
  sources: message.sources,
  createdAt: message.createdAt,
  completedAt: message.completedAt ?? null
})

export { presentChat, presentMessage }
