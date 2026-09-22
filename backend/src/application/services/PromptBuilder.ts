import type { LLMMessageType } from "../../domain/entities/LLMMessage.js"
import type { MessageType } from "../../domain/entities/Message.js"
import type { RetrievedChunkType } from "../../domain/entities/RetrievedChunk.js"
import { MessageRole } from "../../domain/enums/MessageRole.js"
import { MessageStatus } from "../../domain/enums/MessageStatus.js"

/** Replaces `{{name}}` placeholders in a single pass, so substituted values are never expanded again. */
const renderTemplate = (template: string, variables: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) => variables[name] ?? placeholder)

class PromptBuilder {
  build({
    systemPrompt,
    userMessageTemplate,
    contextTemplate,
    history,
    question,
    chunks
  }: {
    systemPrompt: string
    userMessageTemplate: string
    contextTemplate: string
    history: MessageType[]
    question: string
    chunks: RetrievedChunkType[]
  }): LLMMessageType[] {
    const context =
      chunks.length > 0
        ? renderTemplate(contextTemplate, { chunks: chunks.map((chunk) => chunk.text).join("\n\n") })
        : ""
    const userContent = renderTemplate(userMessageTemplate, { context, question }).trim()

    return [
      { role: "system", content: systemPrompt },
      ...this.toConversationTurns(history),
      { role: "user", content: userContent }
    ]
  }

  /** Keeps only complete question/answer pairs, so failed generations never leave a dangling user message. */
  private toConversationTurns(history: MessageType[]): LLMMessageType[] {
    const turns: LLMMessageType[] = []
    for (let i = 0; i < history.length - 1; i++) {
      const message = history[i]!
      const next = history[i + 1]!
      if (
        message.role === MessageRole.USER &&
        next.role === MessageRole.ASSISTANT &&
        next.status === MessageStatus.DONE &&
        next.content
      ) {
        turns.push({ role: "user", content: message.content }, { role: "assistant", content: next.content })
        i++
      }
    }
    return turns
  }
}

export default PromptBuilder
export { renderTemplate }
