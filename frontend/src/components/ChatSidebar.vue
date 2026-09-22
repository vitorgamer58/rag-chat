<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import ErrorBanner from '@/components/ErrorBanner.vue'
import TypingIndicator from '@/components/TypingIndicator.vue'

const store = useChatStore()
</script>

<template>
  <aside class="sidebar">
    <button type="button" class="new-chat" @click="store.createNewChat()">+ New chat</button>

    <ErrorBanner
      v-if="store.chatsError"
      :message="store.chatsError"
      @retry="store.loadChats()"
      @dismiss="store.chatsError = null"
    />

    <TypingIndicator v-if="store.chatsLoading" size="sm" label="Carregando conversas" class="loading" />
    <p v-else-if="store.chats.length === 0" class="empty">No chats yet.</p>

    <ul class="chat-list">
      <li v-for="chat in store.chats" :key="chat.id">
        <button
          type="button"
          class="chat-item"
          :class="{ active: chat.id === store.activeChatId }"
          @click="store.selectChat(chat.id)"
        >
          {{ chat.title ?? 'New chat' }}
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

.new-chat {
  padding: 0.5rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
  cursor: pointer;
  text-align: left;
}

.empty {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.loading {
  padding: 0.5rem;
}

.chat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.chat-item {
  width: 100%;
  text-align: left;
  padding: 0.5rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-item:hover {
  background: var(--color-bg-muted);
}

.chat-item.active {
  background: var(--color-bg-muted);
  font-weight: 600;
}
</style>
