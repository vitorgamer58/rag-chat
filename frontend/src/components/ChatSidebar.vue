<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import ErrorBanner from '@/components/ErrorBanner.vue'
import TypingIndicator from '@/components/TypingIndicator.vue'

defineProps<{ open?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useChatStore()

function newChat() {
  store.createNewChat()
  emit('close')
}

function select(id: string) {
  store.selectChat(id)
  emit('close')
}
</script>

<template>
  <div class="backdrop" :class="{ visible: open }" @click="emit('close')"></div>
  <aside class="sidebar" :class="{ open }">
    <button type="button" class="new-chat" @click="newChat()">+ New chat</button>

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
          @click="select(chat.id)"
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

.backdrop {
  display: none;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 20;
    width: min(280px, 85vw);
    background: var(--color-bg);
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 10;
    background: rgba(0, 0, 0, 0.4);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
