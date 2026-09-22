export const MessageStatus = {
  PENDING: "pending",
  STREAMING: "streaming",
  DONE: "done",
  FAILED: "failed"
} as const

export type MessageStatusType = (typeof MessageStatus)[keyof typeof MessageStatus]
