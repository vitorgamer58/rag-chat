import { BASE_URL } from '@/api/client'

/**
 * Builds the SSE stream URL. The fingerprint and the resume cursor travel as query params — the only route
 * that accepts them this way — because the native `EventSource` API cannot set custom request headers, so
 * `X-Fingerprint`/`Last-Event-ID` (used by every other endpoint) aren't an option here.
 *
 * `lastEventId <= 0` means "replay everything from the start" and the param is omitted entirely, matching
 * the backend's own default-to-0 behavior.
 */
export function buildStreamUrl(
  chatId: string,
  messageId: string,
  fingerprint: string,
  lastEventId: number,
): string {
  const url = new URL(`/api/chats/${chatId}/messages/${messageId}/stream`, BASE_URL)
  url.searchParams.set('fingerprint', fingerprint)
  if (lastEventId > 0) url.searchParams.set('lastEventId', String(lastEventId))
  return url.toString()
}
