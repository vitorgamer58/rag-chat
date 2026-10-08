<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createIcon } from '@download/blockies'
import { getFingerprint } from '@/composables/useFingerprint'

const fingerprint = ref<string | null>(null)
const avatarUrl = ref<string | null>(null)

/** Shortens the fingerprint wallet-address style (`a1b2c3…9f8e`); short values are returned as-is. */
function truncateFingerprint(fp: string): string {
  return fp.length <= 10 ? fp : `${fp.slice(0, 6)}…${fp.slice(-4)}`
}

onMounted(async () => {
  const fp = await getFingerprint()
  fingerprint.value = fp
  // No explicit colors: Blockies derives them from the seed, so the same fingerprint always gets the same icon.
  avatarUrl.value = createIcon({ seed: fp, size: 8, scale: 4 }).toDataURL()
})
</script>

<template>
  <div class="user-identity" :title="fingerprint ?? undefined">
    <img v-if="avatarUrl" :src="avatarUrl" alt="" class="avatar" />
    <span v-else class="avatar placeholder"></span>
    <span class="label" :class="{ muted: !fingerprint }">
      {{ fingerprint ? truncateFingerprint(fingerprint) : '…' }}
    </span>
  </div>
</template>

<style scoped>
.user-identity {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem;
  border-radius: var(--radius-md);
}

.avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  image-rendering: pixelated;
}

.placeholder {
  background: var(--color-bg-muted);
}

.label {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--color-text-muted);
}
</style>
