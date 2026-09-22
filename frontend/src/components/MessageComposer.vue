<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import ErrorBanner from '@/components/ErrorBanner.vue'
import TypingIndicator from '@/components/TypingIndicator.vue'

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
        <TypingIndicator v-if="submitting || store.isComposerDisabled" size="sm" label="Enviando" />
        <template v-else>Send</template>
      </button>
    </form>
  </div>
</template>

<style scoped>
.composer {
  padding: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.composer-form {
  display: flex;
  gap: 0.5rem;
}

textarea {
  flex: 1;
  resize: none;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4.5rem;
  padding: 0 1rem;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-accent-solid);
  color: var(--color-text-inverse);
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--color-accent-solid-hover);
}

button:disabled {
  background: var(--color-accent-disabled);
  cursor: not-allowed;
}
</style>
