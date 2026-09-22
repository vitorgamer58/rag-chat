import { DomainError } from "./DomainError.js"

export class ConfigNotFoundError extends DomainError {
  readonly code = "CONFIG_NOT_FOUND"

  constructor(readonly key: string) {
    super(`Configuration "${key}" not found in the database. Run the seed-config script.`)
  }
}
