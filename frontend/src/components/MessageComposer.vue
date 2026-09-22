<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import ErrorBanner from '@/components/ErrorBanner.vue'

const store = useChatStore()
const content = ref('')
// Covers the window between the click and the POST resolving, before an assistant placeholder exists for
// `isComposerDisabled` to pick up.
const submitting = ref(false)

async function submit() {
  const text = content.value.trim()
  if (!text || submitting.value || store.isComposerDisabled) return

  content.value = ''
  submitting.value = true
  try {
    await store.sendMessage(text)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="composer">
    <ErrorBanner
      v-if="store.composerError"
      :message="store.composerError"
      @retry="submit"
      @dismiss="store.composerError = null"
    />
    <form class="composer-form" @submit.prevent="submit">
      <textarea
        v-model="content"
        rows="2"
        placeholder="Type a message..."
        :disabled="submitting || store.isComposerDisabled"
        @keydown.enter.exact.prevent="submit"
      />
      <button type="submit" :disabled="submitting || store.isComposerDisabled || !content.trim()">
        Send
      </button>
    </form>
  </div>
</template>

<style scoped>
.composer {
  padding: 0.75rem;
  border-top: 1px solid #e0e0e0;
}

.composer-form {
  display: flex;
  gap: 0.5rem;
}

textarea {
  flex: 1;
  resize: none;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 6px;
}

button {
  padding: 0 1rem;
  border: none;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}

button:disabled {
  background: #a9a9a9;
  cursor: not-allowed;
}
</style>
