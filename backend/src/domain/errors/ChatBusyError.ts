import { DomainError } from "./DomainError.js"

export class ChatBusyError extends DomainError {
  readonly code = "CHAT_BUSY"

  constructor() {
    super("This chat is still generating a response")
  }
}
