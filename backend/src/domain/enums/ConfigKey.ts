export const ConfigKey = {
  SYSTEM_PROMPT: "system_prompt",
  USER_MESSAGE_TEMPLATE: "user_message_template",
  CONTEXT_TEMPLATE: "context_template"
} as const

export type ConfigKeyType = (typeof ConfigKey)[keyof typeof ConfigKey]
