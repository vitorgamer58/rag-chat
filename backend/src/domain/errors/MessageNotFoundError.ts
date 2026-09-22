import { DomainError } from "./DomainError.js"

export class MessageNotFoundError extends DomainError {
  readonly code = "MESSAGE_NOT_FOUND"

  constructor() {
    super("Message not found")
  }
}
