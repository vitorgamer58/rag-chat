// Mirrors backend/src/domain/entities/StreamEvent.ts (only the `data:` payload shapes; `event:` is read
// separately via EventSource's own event name).
export interface ChunkEventData {
  seq: number
  text: string
}

export interface DoneEventData {
  content: string
}

export interface FailedEventData {
  message: string
}
