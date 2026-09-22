<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import ErrorBanner from '@/components/ErrorBanner.vue'

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

    <p v-if="!store.chatsLoading && store.chats.length === 0" class="empty">No chats yet.</p>

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
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
}

.new-chat {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #f7f7f7;
  cursor: pointer;
  text-align: left;
}

.empty {
  color: #888;
  font-size: 0.875rem;
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
  background: #f0f0f0;
}

.chat-item.active {
  background: #e6e6e6;
  font-weight: 600;
}
</style>
