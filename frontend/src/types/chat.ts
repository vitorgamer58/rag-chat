// Mirrors `presentChat` in backend/src/infra/http/presenters.ts
export interface Chat {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
}
