<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import ChatSidebar from '@/components/ChatSidebar.vue'
import ChatWindow from '@/components/ChatWindow.vue'

const store = useChatStore()
const sidebarOpen = ref(false)

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
    <ChatSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <ChatWindow @open-menu="sidebarOpen = true" />
  </div>
</template>
