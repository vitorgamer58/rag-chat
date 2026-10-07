import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { createChat, getChatMessages, listChats, sendMessage as sendMessageApi } from '@/api/chats'
import { buildStreamUrl } from '@/api/sse'
import { ApiError, NetworkError } from '@/api/client'
import { getFingerprint } from '@/composables/useFingerprint'
import type { Chat } from '@/types/chat'
import type { Message } from '@/types/message'
import type { ChunkEventData, DoneEventData, FailedEventData } from '@/types/stream'

const CHAT_LIST_PAGE_SIZE = 30

/** Client-side view of an in-progress (or just-finished) generation, keyed by the assistant message id. */
interface StreamState {
  text: string
  /** The highest chunk `seq` applied so far — this IS the resume cursor for `?lastEventId=`. */
  lastSeq: number
  status: 'streaming' | 'done' | 'failed'
  errorMessage?: string
  eventSource: EventSource | null
}

/** Turns a thrown error into a short, user-facing sentence. */
function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.issues?.[0]?.message ?? error.message
  if (error instanceof NetworkError) return error.message
  return 'Something went wrong.'
}

/** Same as `describeError`, but with the extra per-code behavior the send flow needs (see the plan's error table). */
function describeSendError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'RATE_LIMIT_EXCEEDED':
        return `You're sending messages too fast. Try again in ${error.retryAfterSeconds ?? 60}s.`
      case 'CHAT_NOT_FOUND':
        return 'This chat no longer exists. Start a new one.'
      case 'CHAT_BUSY':
        return 'A response is already being generated in this chat.'
      default:
        return describeError(error)
    }
  }
  return describeError(error)
}

export const useChatStore = defineStore('chat', () => {
  // ---- state ----
  const chats = ref<Chat[]>([])
  const activeChatId = ref<string | null>(null)
  const messagesByChat = reactive(new Map<string, Message[]>())
  const streaming = reactive(new Map<string, StreamState>())

  const chatsLoading = ref(false)
  const chatsError = ref<string | null>(null)
  const messagesLoading = ref(false)
  const messagesError = ref<string | null>(null)
  const composerError = ref<string | null>(null)

  // ---- computed ----
  const activeMessages = computed(() => messagesByChat.get(activeChatId.value ?? '') ?? [])

  const sendingMessage = ref(false)

  const isComposerDisabled = computed(() =>
    activeMessages.value.some(
      (m) => m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming'),
    ),
  )

  // ---- helpers ----
  function findMessage(chatId: string, messageId: string): Message | undefined {
    return messagesByChat.get(chatId)?.find((m) => m.id === messageId)
  }

  function findChatIdForStreamingMessage(messageId: string): string | undefined {
    for (const [chatId, list] of messagesByChat) {
      if (list.some((m) => m.id === messageId)) return chatId
    }
    return undefined
  }

  function finalizeMessage(chatId: string, messageId: string, patch: Partial<Message>): void {
    const msg = findMessage(chatId, messageId)
    if (msg) Object.assign(msg, patch)
  }

  /**
   * Opens (or reopens) the live view of an assistant message's generation.
   *
   * Two independent layers of "resume" are at play here, and only one of them is this function's job:
   * 1. Browser-native resume: if this exact `EventSource` object drops on a transient network blip, the
   *    browser reconnects it on its own and automatically resends whatever `id:` it last saw as a
   *    `Last-Event-ID` request header. Nothing to do here — that's free.
   * 2. App-level resume: this function's job. It runs whenever *we* construct a brand-new `EventSource`
   *    (first send, reload, or switching back to a chat whose stream we'd closed) and must pass the right
   *    starting point explicitly via `?lastEventId=`. That point always comes from `lastEventId`/`state.lastSeq`
   *    — never from `message.content` — so a client that already has partial text never re-requests it.
   */
  function openStream(chatId: string, messageId: string, lastEventId: number): void {
    const state: StreamState =
      streaming.get(messageId) ??
      reactive({ text: '', lastSeq: 0, status: 'streaming', eventSource: null })
    streaming.set(messageId, state)

    void getFingerprint().then((fingerprint) => {
      // The chat may have been switched away from while the fingerprint promise was resolving.
      if (activeChatId.value !== chatId) return

      const es = new EventSource(buildStreamUrl(chatId, messageId, fingerprint, lastEventId))
      state.eventSource = es

      es.addEventListener('chunk', (ev) => {
        const data = JSON.parse((ev as MessageEvent<string>).data) as ChunkEventData
        if (data.seq <= state.lastSeq) return // defensive dedupe against any overlap on a browser auto-retry
        state.text += data.text
        state.lastSeq = data.seq
      })

      es.addEventListener('done', (ev) => {
        const data = JSON.parse((ev as MessageEvent<string>).data) as DoneEventData
        state.status = 'done'
        finalizeMessage(chatId, messageId, {
          status: 'done',
          content: data.content,
          sources: data.sources,
          completedAt: new Date().toISOString(),
        })
        es.close()
        state.eventSource = null
      })

      es.addEventListener('failed', (ev) => {
        const data = JSON.parse((ev as MessageEvent<string>).data) as FailedEventData
        state.status = 'failed'
        state.errorMessage = data.message
        finalizeMessage(chatId, messageId, { status: 'failed' })
        es.close()
        state.eventSource = null
      })

      // `es.onerror` during a transient drop is handled by the browser itself (see the docstring above).
      // If the stream is closed for good, the next visit to this chat (or a reload) falls back to
      // `GET .../messages`, which is always the durable source of truth regardless of live-view state.
    })
  }

  /** Keeps only the active chat's stream connections open; server-side generation is unaffected either way. */
  function closeStreamsNotBelongingTo(chatId: string): void {
    for (const [messageId, state] of streaming) {
      const owningChatId = findChatIdForStreamingMessage(messageId)
      if (owningChatId && owningChatId !== chatId && state.eventSource) {
        state.eventSource.close()
        state.eventSource = null
        // `state.status` stays 'streaming' — that flag is what resumeInFlightStreamsFor() checks below.
      }
    }
  }

  function resumeInFlightStreamsFor(chatId: string): void {
    for (const message of messagesByChat.get(chatId) ?? []) {
      const state = streaming.get(message.id)
      if (state && state.status === 'streaming' && !state.eventSource) {
        openStream(chatId, message.id, state.lastSeq)
      }
    }
  }

  function closeAllStreams(): void {
    for (const state of streaming.values()) {
      state.eventSource?.close()
      state.eventSource = null
    }
  }

  // ---- actions ----
  async function loadChats(): Promise<void> {
    chatsLoading.value = true
    chatsError.value = null
    try {
      const { chats: list } = await listChats({ limit: CHAT_LIST_PAGE_SIZE })
      chats.value = list
    } catch (error) {
      chatsError.value = describeError(error)
    } finally {
      chatsLoading.value = false
    }
  }

  async function createNewChat(): Promise<Chat> {
    const { chat } = await createChat()
    chats.value.unshift(chat)
    messagesByChat.set(chat.id, [])
    activeChatId.value = chat.id
    return chat
  }

  async function loadMessages(chatId: string): Promise<void> {
    messagesLoading.value = true
    messagesError.value = null
    try {
      const { messages } = await getChatMessages(chatId)
      messagesByChat.set(chatId, messages)
      for (const message of messages) {
        if (
          message.role === 'assistant' &&
          (message.status === 'pending' || message.status === 'streaming')
        ) {
          // A fresh load: this client has never seen any chunk of this message, so replay from the start
          // (lastEventId 0) rather than seeding from `message.content`, which would double-append on resume.
          streaming.set(
            message.id,
            reactive({ text: '', lastSeq: 0, status: 'streaming', eventSource: null }),
          )
          openStream(chatId, message.id, 0)
        }
      }
    } catch (error) {
      messagesError.value = describeError(error)
    } finally {
      messagesLoading.value = false
    }
  }

  async function selectChat(chatId: string): Promise<void> {
    if (chatId === activeChatId.value) return
    closeStreamsNotBelongingTo(chatId)
    activeChatId.value = chatId
    if (!messagesByChat.has(chatId)) {
      await loadMessages(chatId)
    } else {
      resumeInFlightStreamsFor(chatId)
    }
  }

  /** Loads the chat list and either resumes the most recently active chat or starts a brand-new one. */
  async function bootstrap(): Promise<void> {
    await loadChats()
    const mostRecent = chats.value[0]
    if (mostRecent) {
      await selectChat(mostRecent.id)
    } else {
      await createNewChat()
    }
  }

  async function sendMessage(content: string): Promise<void> {
    composerError.value = null
    let chatId = activeChatId.value
    if (!chatId) chatId = (await createNewChat()).id

    const list = messagesByChat.get(chatId) ?? []
    messagesByChat.set(chatId, list)

    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    list.push({
      id: tempId,
      chatId,
      role: 'user',
      content,
      status: 'done',
      sources: [],
      createdAt: now,
      completedAt: now,
    })

    sendingMessage.value = true
    try {
      const { userMessageId, assistantMessageId } = await sendMessageApi(chatId, content)

      const userMsg = list.find((m) => m.id === tempId)
      if (userMsg) userMsg.id = userMessageId

      list.push({
        id: assistantMessageId,
        chatId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        sources: [],
        createdAt: now,
        completedAt: null,
      })
      streaming.set(
        assistantMessageId,
        reactive({ text: '', lastSeq: 0, status: 'streaming', eventSource: null }),
      )
      openStream(chatId, assistantMessageId, 0)

      void loadChats() // opportunistic refresh so the sidebar picks up the server-derived title
    } catch (error) {
      const idx = list.findIndex((m) => m.id === tempId)
      if (idx !== -1) list.splice(idx, 1) // roll back the optimistic bubble
      composerError.value = describeSendError(error)
    } finally {
      sendingMessage.value = false
    }
  }

  return {
    chats,
    activeChatId,
    activeMessages,
    messagesByChat,
    streaming,
    chatsLoading,
    chatsError,
    messagesLoading,
    messagesError,
    composerError,
    isComposerDisabled,
    sendingMessage,
    bootstrap,
    loadChats,
    createNewChat,
    selectChat,
    sendMessage,
    closeAllStreams,
  }
})
