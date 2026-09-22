import type { MessageSource } from './message'

// Mirrors backend/src/domain/entities/StreamEvent.ts (only the `data:` payload shapes; `event:` is read
// separately via EventSource's own event name).
export interface ChunkEventData {
  seq: number
  text: string
}

export interface DoneEventData {
  content: string
  sources: MessageSource[]
}

export interface FailedEventData {
  message: string
}
