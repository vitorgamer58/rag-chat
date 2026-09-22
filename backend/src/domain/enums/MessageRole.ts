export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant"
} as const

export type MessageRoleType = (typeof MessageRole)[keyof typeof MessageRole]
