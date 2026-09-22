<script setup lang="ts">
import MessageList from '@/components/MessageList.vue'
import MessageComposer from '@/components/MessageComposer.vue'
</script>

<template>
  <section class="chat-window">
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
}
</style>
