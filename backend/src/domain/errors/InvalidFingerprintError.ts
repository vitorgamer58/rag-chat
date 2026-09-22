import { DomainError } from "./DomainError.js"

export class InvalidFingerprintError extends DomainError {
  readonly code = "INVALID_FINGERPRINT"

  constructor() {
    super("Missing or invalid fingerprint")
  }
}
