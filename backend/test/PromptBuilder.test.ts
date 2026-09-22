import { describe, expect, it } from "vitest"
import PromptBuilder, { renderTemplate } from "../src/application/services/PromptBuilder.js"
import type { MessageType } from "../src/domain/entities/Message.js"

const message = (overrides: Partial<MessageType>): MessageType => ({
  id: "id",
  chatId: "chat",
  userId: "user",
  role: "user",
  content: "",
  status: "done",
  sources: [],
  createdAt: new Date(),
  ...overrides
})

const base = {
  systemPrompt: "SYSTEM",
  userMessageTemplate: "{{context}}Refute this:\nQuestion:\n{{question}}\n",
  contextTemplate: "---\nContext:\n{{chunks}}\n---\n"
}

describe("renderTemplate", () => {
  it("replaces placeholders in a single pass and keeps unknown ones", () => {
    expect(renderTemplate("{{a}} {{b}} {{c}}", { a: "{{b}}", b: "B" })).toBe("{{b}} B {{c}}")
  })

  it("does not interpret $ patterns in the replacement", () => {
    expect(renderTemplate("{{a}}", { a: "$& $1 $$" })).toBe("$& $1 $$")
  })
})

describe("PromptBuilder", () => {
  const builder = new PromptBuilder()

  it("puts the retrieved context only in the current question", () => {
    const messages = builder.build({
      ...base,
      history: [],
      question: "Is X true?",
      chunks: [
        { title: "A", chunkIndex: 0, text: "chunk one", score: 0.9 },
        { title: "B", chunkIndex: 1, text: "chunk two", score: 0.85 }
      ]
    })

    expect(messages).toEqual([
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "---\nContext:\nchunk one\n\nchunk two\n---\nRefute this:\nQuestion:\nIs X true?" }
    ])
  })

  it("omits the context section when nothing was retrieved", () => {
    const messages = builder.build({ ...base, history: [], question: "Hi", chunks: [] })

    expect(messages[1]?.content).toBe("Refute this:\nQuestion:\nHi")
  })

  it("sends previous turns as plain question and answer", () => {
    const messages = builder.build({
      ...base,
      history: [
        message({ id: "1", role: "user", content: "first question" }),
        message({ id: "2", role: "assistant", content: "first answer" })
      ],
      question: "second question",
      chunks: []
    })

    expect(messages.map((item) => [item.role, item.content])).toEqual([
      ["system", "SYSTEM"],
      ["user", "first question"],
      ["assistant", "first answer"],
      ["user", "Refute this:\nQuestion:\nsecond question"]
    ])
  })

  it("drops questions whose answer failed and answers cut off at the start of the window", () => {
    const messages = builder.build({
      ...base,
      history: [
        message({ id: "0", role: "assistant", content: "orphan answer" }),
        message({ id: "1", role: "user", content: "failed question" }),
        message({ id: "2", role: "assistant", content: "", status: "failed" }),
        message({ id: "3", role: "user", content: "good question" }),
        message({ id: "4", role: "assistant", content: "good answer" })
      ],
      question: "now",
      chunks: []
    })

    expect(messages.map((item) => item.content)).toEqual([
      "SYSTEM",
      "good question",
      "good answer",
      "Refute this:\nQuestion:\nnow"
    ])
  })
})
