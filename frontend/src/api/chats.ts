import { fetchJson } from '@/api/client'
import type { Chat } from '@/types/chat'
import type { Message } from '@/types/message'
import type { ListChatsParams } from '@/types/api'

export const createChat = (): Promise<{ chat: Chat }> => fetchJson('/api/chats', { method: 'POST' })

export const listChats = (params: ListChatsParams = {}): Promise<{ chats: Chat[] }> => {
  const query = new URLSearchParams()
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.before !== undefined) query.set('before', params.before)
  const qs = query.size > 0 ? `?${query}` : ''
  return fetchJson(`/api/chats${qs}`)
}

export const getChatMessages = (chatId: string): Promise<{ messages: Message[] }> =>
  fetchJson(`/api/chats/${chatId}/messages`)

export const sendMessage = (
  chatId: string,
  content: string,
): Promise<{ userMessageId: string; assistantMessageId: string }> =>
  fetchJson(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
