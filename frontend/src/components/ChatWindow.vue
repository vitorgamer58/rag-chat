<script setup lang="ts">
import MessageList from '@/components/MessageList.vue'
import MessageComposer from '@/components/MessageComposer.vue'
const emit = defineEmits<{ 'open-menu': [] }>()
</script>

<template>
  <section class="chat-window">
    <header class="topbar">
      <button type="button" class="menu-btn" aria-label="Abrir conversas" @click="emit('open-menu')">☰</button>
    </header>
    <MessageList />
    <MessageComposer />
  </section>
</template>

<style scoped>
.chat-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.topbar {
  display: none;
}

@media (max-width: 768px) {
  .topbar {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .menu-btn {
    padding: 0.25rem 0.6rem;
    font-size: 1.25rem;
    line-height: 1;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-bg-subtle);
    color: inherit;
    cursor: pointer;
  }
}
</style>
