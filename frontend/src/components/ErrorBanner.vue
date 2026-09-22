<script setup lang="ts">
defineProps<{ message: string }>()
const emit = defineEmits<{ dismiss: []; retry: [] }>()
</script>

<template>
  <div class="error-banner" role="alert">
    <span>{{ message }}</span>
    <button type="button" @click="emit('retry')">Retry</button>
    <button type="button" @click="emit('dismiss')" aria-label="Dismiss">&times;</button>
  </div>
</template>

<style scoped>
.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #fdecea;
  color: #611a15;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  font-size: 0.875rem;
}

.error-banner span {
  flex: 1;
}

.error-banner button {
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
</style>
