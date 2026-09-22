<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import ChatSidebar from '@/components/ChatSidebar.vue'
import ChatWindow from '@/components/ChatWindow.vue'

const store = useChatStore()

onMounted(() => {
  void store.bootstrap()
  window.addEventListener('beforeunload', store.closeAllStreams)
})

onUnmounted(() => {
  store.closeAllStreams()
  window.removeEventListener('beforeunload', store.closeAllStreams)
})
</script>

<template>
  <div class="layout">
    <ChatSidebar />
    <ChatWindow />
  </div>
</template>
