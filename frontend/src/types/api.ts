// Mirrors the error envelope built by backend/src/infra/http/middlewares/errorHandler.ts
export interface ApiErrorIssue {
  path: string
  message: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    retryAfterSeconds?: number
    issues?: ApiErrorIssue[]
  }
}

export interface ListChatsParams {
  limit?: number
  before?: string
}
