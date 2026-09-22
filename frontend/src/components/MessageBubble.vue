<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useChatStore } from '@/stores/chat'
import type { Message } from '@/types/message'
import TypingIndicator from '@/components/TypingIndicator.vue'

const props = defineProps<{ message: Message }>()
const store = useChatStore()

const streamState = computed(() => store.streaming.get(props.message.id))

const displayText = computed(() => {
  const state = streamState.value
  return state && state.status === 'streaming' ? state.text : props.message.content
})

const isAwaitingFirstToken = computed(
  () => streamState.value?.status === 'streaming' && !displayText.value,
)

const isFailed = computed(
  () => props.message.status === 'failed' || streamState.value?.status === 'failed',
)

const failureText = computed(() => streamState.value?.errorMessage ?? 'Something went wrong.')

// Assistant answers are Markdown (see the system prompt); user input is never parsed as Markdown. The LLM's
// output isn't trusted HTML, so it's sanitized with DOMPurify before being injected via v-html. Mid-stream,
// incomplete Markdown (e.g. an unclosed `**`) briefly renders literally until it completes — expected, same
// as any streaming Markdown chat UI.
const renderedHtml = computed(() => {
  if (props.message.role !== 'assistant') return ''
  return DOMPurify.sanitize(marked.parse(displayText.value, { async: false }))
})
</script>

<template>
  <div class="bubble" :class="[message.role, { failed: isFailed }]">
    <TypingIndicator v-if="isAwaitingFirstToken" size="md" label="Gerando resposta" />
    <div
      v-else-if="message.role === 'assistant' && !isFailed"
      class="content"
      v-html="renderedHtml"
    />
    <p v-else-if="!isFailed" class="content plain">{{ displayText }}</p>
    <p v-else class="content failure">{{ failureText }}</p>

    <ul v-if="message.sources.length > 0" class="sources">
      <li v-for="source in message.sources" :key="`${source.title}-${source.chunkIndex}`">
        {{ source.title }} (#{{ source.chunkIndex }}, score {{ source.score.toFixed(2) }})
      </li>
    </ul>
  </div>
</template>

<style scoped>
.bubble {
  max-width: 70%;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-lg);
  margin-bottom: 0.75rem;
}

.bubble.user {
  align-self: flex-end;
  background: var(--color-accent-pastel);
}

.bubble.assistant {
  align-self: flex-start;
  background: var(--color-surface-assistant);
}

.bubble.failed {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error-border);
}

.content.plain {
  white-space: pre-wrap;
  margin: 0;
}

.content.failure {
  margin: 0;
  color: var(--color-error-text);
}

.content :deep(p) {
  margin: 0 0 0.5em;
}

.content :deep(p:last-child) {
  margin-bottom: 0;
}

.content :deep(pre) {
  background: var(--color-code-bg);
  color: var(--color-code-text);
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  overflow-x: auto;
}

.sources {
  margin: 0.5rem 0 0;
  padding-left: 1rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}
</style>
