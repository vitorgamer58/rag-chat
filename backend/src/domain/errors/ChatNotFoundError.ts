import { DomainError } from "./DomainError.js"

export class ChatNotFoundError extends DomainError {
  readonly code = "CHAT_NOT_FOUND"

  constructor() {
    super("Chat not found")
  }
}
