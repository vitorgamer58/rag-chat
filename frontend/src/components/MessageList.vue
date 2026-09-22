<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageBubble from '@/components/MessageBubble.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'

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
    return [messages.length, streamingText?.length ?? 0] as const
  },
  () => {
    void nextTick(scrollToBottom)
  },
)
</script>

<template>
  <div ref="containerRef" class="message-list">
    <ErrorBanner
      v-if="store.messagesError"
      :message="store.messagesError"
      @retry="store.activeChatId && store.selectChat(store.activeChatId)"
      @dismiss="store.messagesError = null"
    />

    <p v-if="!store.messagesLoading && store.activeMessages.length === 0" class="empty">
      Send a message to start the conversation.
    </p>

    <MessageBubble v-for="message in store.activeMessages" :key="message.id" :message="message" />
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.empty {
  color: #888;
  text-align: center;
  margin-top: 2rem;
}
</style>
