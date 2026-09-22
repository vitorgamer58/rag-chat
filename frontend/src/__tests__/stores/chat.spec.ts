import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useChatStore } from '@/stores/chat'
import { ApiError } from '@/api/client'
import { FakeEventSource } from '@/__tests__/support/FakeEventSource'
import type * as ChatsApi from '@/api/chats'

const { createChat, listChats, getChatMessages, sendMessage } = vi.hoisted(() => ({
  createChat: vi.fn<typeof ChatsApi.createChat>(),
  listChats: vi.fn<typeof ChatsApi.listChats>(),
  getChatMessages: vi.fn<typeof ChatsApi.getChatMessages>(),
  sendMessage: vi.fn<typeof ChatsApi.sendMessage>(),
}))

vi.mock('@/api/chats', () => ({ createChat, listChats, getChatMessages, sendMessage }))
vi.mock('@/composables/useFingerprint', () => ({
  getFingerprint: () => Promise.resolve('fp-test'),
}))

const chat = (id: string) => ({
  id,
  title: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

beforeEach(() => {
  setActivePinia(createPinia())
  FakeEventSource.reset()
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.clearAllMocks()
})

describe('useChatStore.sendMessage', () => {
  it('appends the user bubble optimistically, then the streaming assistant placeholder', async () => {
    const store = useChatStore()
    store.activeChatId = 'chat-1'
    store.chats = [chat('chat-1')]

    sendMessage.mockResolvedValue({ userMessageId: 'user-1', assistantMessageId: 'assistant-1' })
    listChats.mockResolvedValue({ chats: [chat('chat-1')] })

    await store.sendMessage('Hello there')

    const messages = store.activeMessages
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      content: 'Hello there',
      status: 'done',
    })
    expect(messages[1]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      status: 'streaming',
    })
    expect(store.isComposerDisabled).toBe(true)

    await flushPromises()
    expect(FakeEventSource.last().url).toContain('/api/chats/chat-1/messages/assistant-1/stream')
    expect(FakeEventSource.last().url).not.toContain('lastEventId') // brand-new stream: replay from the start
  })

  it('rolls back the optimistic bubble and sets composerError when the POST fails', async () => {
    const store = useChatStore()
    store.activeChatId = 'chat-1'
    store.chats = [chat('chat-1')]

    sendMessage.mockRejectedValue(
      new ApiError(429, {
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'slow down', retryAfterSeconds: 42 },
      }),
    )

    await store.sendMessage('Too fast')

    expect(store.activeMessages).toHaveLength(0)
    expect(store.composerError).toContain('42s')
  })

  it('streams chunks into state.text and finalizes the message on done', async () => {
    const store = useChatStore()
    store.activeChatId = 'chat-1'
    store.chats = [chat('chat-1')]
    sendMessage.mockResolvedValue({ userMessageId: 'user-1', assistantMessageId: 'assistant-1' })
    listChats.mockResolvedValue({ chats: [chat('chat-1')] })

    await store.sendMessage('Hi')
    await flushPromises()

    const es = FakeEventSource.last()
    es.emit('chunk', { seq: 1, text: 'Hel' })
    es.emit('chunk', { seq: 2, text: 'lo' })

    const state = store.streaming.get('assistant-1')
    expect(state?.text).toBe('Hello')
    expect(state?.lastSeq).toBe(2)

    es.emit('done', { content: 'Hello' })

    expect(es.closed).toBe(true)
    const assistantMsg = store.activeMessages.find((m) => m.id === 'assistant-1')
    expect(assistantMsg).toMatchObject({ status: 'done', content: 'Hello' })
    expect(store.isComposerDisabled).toBe(false)
  })
})

describe('useChatStore.loadMessages / selectChat resume behavior', () => {
  it('reopens a stream left pending/streaming from a fresh load, starting at lastEventId 0', async () => {
    const store = useChatStore()
    store.chats = [chat('chat-1')]
    getChatMessages.mockResolvedValue({
      messages: [
        {
          id: 'assistant-1',
          chatId: 'chat-1',
          role: 'assistant',
          content: '',
          status: 'streaming',
          sources: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          completedAt: null,
        },
      ],
    })

    await store.selectChat('chat-1')
    await flushPromises()

    expect(FakeEventSource.last().url).not.toContain('lastEventId')
    expect(store.streaming.get('assistant-1')?.status).toBe('streaming')
  })

  it('closes the stream when switching chats and resumes from lastSeq when switching back', async () => {
    const store = useChatStore()
    store.chats = [chat('chat-1'), chat('chat-2')]
    getChatMessages.mockImplementation((chatId: string) =>
      Promise.resolve({
        messages:
          chatId === 'chat-1'
            ? [
                {
                  id: 'assistant-1',
                  chatId: 'chat-1',
                  role: 'assistant',
                  content: '',
                  status: 'streaming',
                  sources: [],
                  createdAt: '2026-01-01T00:00:00.000Z',
                  completedAt: null,
                },
              ]
            : [],
      }),
    )

    await store.selectChat('chat-1')
    await flushPromises()
    const firstStream = FakeEventSource.last()
    firstStream.emit('chunk', { seq: 1, text: 'partial' })

    await store.selectChat('chat-2')
    expect(firstStream.closed).toBe(true)
    // Server-side generation keeps running regardless; only this tab's live view stopped.
    expect(store.streaming.get('assistant-1')?.status).toBe('streaming')

    await store.selectChat('chat-1')
    await flushPromises()

    const resumedStream = FakeEventSource.last()
    expect(resumedStream).not.toBe(firstStream)
    expect(resumedStream.url).toContain('lastEventId=1') // resumes from where this client already got to
  })
})
