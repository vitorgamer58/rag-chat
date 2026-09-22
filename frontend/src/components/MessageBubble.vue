<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useChatStore } from '@/stores/chat'
import type { Message } from '@/types/message'

const props = defineProps<{ message: Message }>()
const store = useChatStore()

const streamState = computed(() => store.streaming.get(props.message.id))

const displayText = computed(() => {
  const state = streamState.value
  return state && state.status === 'streaming' ? state.text : props.message.content
})

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
    <div v-if="message.role === 'assistant' && !isFailed" class="content" v-html="renderedHtml" />
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
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  margin-bottom: 0.75rem;
}

.bubble.user {
  align-self: flex-end;
  background: #dceeff;
}

.bubble.assistant {
  align-self: flex-start;
  background: #f2f2f2;
}

.bubble.failed {
  background: #fdecea;
}

.content.plain {
  white-space: pre-wrap;
  margin: 0;
}

.content.failure {
  margin: 0;
  color: #611a15;
}

.content :deep(p) {
  margin: 0 0 0.5em;
}

.content :deep(p:last-child) {
  margin-bottom: 0;
}

.content :deep(pre) {
  background: #1e1e1e;
  color: #eee;
  padding: 0.5rem;
  border-radius: 6px;
  overflow-x: auto;
}

.sources {
  margin: 0.5rem 0 0;
  padding-left: 1rem;
  font-size: 0.75rem;
  color: #666;
}
</style>
