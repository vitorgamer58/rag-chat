export type MessageRole = 'user' | 'assistant'
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'failed'

export interface MessageSource {
  title: string
  chunkIndex: number
  score: number
}

// Mirrors `presentMessage` in backend/src/infra/http/presenters.ts
export interface Message {
  id: string
  chatId: string
  role: MessageRole
  content: string
  status: MessageStatus
  sources: MessageSource[]
  createdAt: string
  completedAt: string | null
}
