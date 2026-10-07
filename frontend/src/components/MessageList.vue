<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageBubble from '@/components/MessageBubble.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import TypingIndicator from '@/components/TypingIndicator.vue'

const store = useChatStore()
const containerRef = ref<HTMLElement | null>(null)

function scrollToBottom() {
  const el = containerRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// Re-scroll whenever the message count changes, or the last message's live text grows.
watch(
  () => {
    const messages = store.activeMessages
    const last = messages[messages.length - 1]
    const streamingText = last ? store.streaming.get(last.id)?.text : undefined
    return [messages.length, streamingText?.length ?? 0, store.sendingMessage] as const
  },
  () => {
    void nextTick(scrollToBottom)
  },
)
</script>

<template>
  <div ref="containerRef" class="message-list">
    <div class="message-list-inner">
      <ErrorBanner
        v-if="store.messagesError"
        :message="store.messagesError"
        @retry="store.activeChatId && store.selectChat(store.activeChatId)"
        @dismiss="store.messagesError = null"
      />

      <TypingIndicator v-if="store.messagesLoading" size="sm" label="Carregando mensagens" class="loading" />
      <p v-else-if="store.activeMessages.length === 0" class="empty">
        Send a message to start the conversation.
      </p>

      <MessageBubble v-for="message in store.activeMessages" :key="message.id" :message="message" />

      <div v-if="store.sendingMessage" class="bubble-pending">
        <TypingIndicator size="md" label="Gerando resposta" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.message-list-inner {
  max-width: 768px;
  margin: 0 auto;
  padding: 0 1.5rem;
  display: flex;
  flex-direction: column;
}

.empty {
  color: var(--color-text-muted);
  text-align: center;
  margin-top: 2rem;
}

.bubble-pending {
  align-self: flex-start;
  padding: 0.6rem 1rem;
  margin-bottom: 0.75rem;
  border-radius: var(--radius-lg);
  background: var(--color-surface-assistant);
}

.loading {
  align-self: center;
  margin-top: 2rem;
}
</style>
