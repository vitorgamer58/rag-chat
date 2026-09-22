# rag-chat

Backend for a ChatGPT-like chat that answers using RAG (Retrieval-Augmented Generation) over a knowledge base
indexed with MongoDB Atlas Vector Search. The project grew out of an earlier command-line RAG prototype built on
the same MongoDB collection: same system prompt, same idea of retrieving relevant document chunks and grounding an
LLM's answer in them, now exposed as a web API with per-user conversation history, incremental streaming, and
persistence in the database.

This repository currently contains only `backend/`; a `frontend/` will be added later, consuming the same API.

## Table of contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Architecture](#architecture)
  - [Onion Architecture / DDD](#onion-architecture--ddd)
  - [Why resumable SSE instead of WebSocket](#why-resumable-sse-instead-of-websocket)
  - [User identity: fingerprint, not IP](#user-identity-fingerprint-not-ip)
  - [RAG: why Mistral embeddings over the existing collection](#rag-why-mistral-embeddings-over-the-existing-collection)
  - [The prompt lives in the database, not hardcoded](#the-prompt-lives-in-the-database-not-hardcoded)
  - [Two LLM providers behind a single port](#two-llm-providers-behind-a-single-port)
  - [Data model](#data-model)
- [Running locally](#running-locally)
- [Testing](#testing)

## What it does

Each user — identified by a browser fingerprint generated with FingerprintJS, no sign-up required — can create
chats, converse within each one, list their past chats, and reopen any of them to continue where they left off.
Every message goes through a RAG pipeline: a vector search over the indexed documents, then a prompt assembled from
the retrieved context plus the conversation history, before being sent to the configured LLM (Kimi K3 by default,
or Mistral). The answer streams back to the client token by token as it is generated, and can resume from the exact
point it left off if the connection drops mid-stream.

There is no account system — the fingerprint is the only identity, just enough to isolate each person's
conversations and apply a rate limit, while also making it possible to look at usage in aggregate and reuse real
questions later to train and enrich the knowledge base.

## Stack

TypeScript (ESM/NodeNext), Node.js LTS, Express 5, MongoDB (official driver, no ODM), Zod for schema/env
validation, the official Mistral AI SDK, the OpenAI SDK (used to talk to Kimi's OpenAI-compatible API), Vitest,
ESLint 9 (flat config) + Prettier, pnpm.

## Architecture

### Onion Architecture / DDD

```
backend/src/
  domain/         entities (Zod schemas), enums, domain errors, and the "ports" (interfaces)
  application/    use cases and orchestration services — only depend on domain
  infra/          concrete implementations of the ports: MongoDB, LLM/embedding clients, HTTP (Express)
  index.ts        composition root: wires everything together and starts the server
```

The Onion rule is always the same: dependencies point inward. `domain` imports nothing from outside itself;
`application` only knows about `domain` (never `infra` directly); `infra` is the only layer aware that MongoDB,
Express, or a specific LLM SDK even exist. That direction is enforced by dedicated lint rules
(`no-restricted-imports` in `eslint.config.mts`), so an attempt to import from `infra` inside `application` breaks
`pnpm lint-fix` — it doesn't rely on manual discipline.

Inside `domain`, each port is an interface (`IUserRepository`, `ILLMClient`, `IMessageBus`, ...) and each entity is
a Zod schema with an inferred type (`UserType = z.infer<typeof User>`). In `application/usecases`, each use case is
a class with a single public `execute()` method, with dependencies injected through a named object in the
constructor.

A few things this codebase is deliberately strict about:

- **Typed domain errors** (`RateLimitExceededError`, `ChatBusyError`, `ChatNotFoundError`, ...) instead of generic
  `throw new Error()`, so the HTTP error handler can map each one to the right status code without inspecting
  messages.
- **Env validated with Zod and fail-fast** (`infra/config/index.ts`) instead of `process.env.X || ""`: if a
  required variable is missing, the process doesn't even start.
- **MongoDB indexes created on boot** (`ensureIndexes`), idempotently, instead of assumed to already exist.
- **Graceful shutdown**: on `SIGINT`/`SIGTERM`, the HTTP server stops accepting connections, in-flight generations
  are marked as interrupted, and only then is the MongoDB connection closed.
- **A test suite** (Vitest) covering the use cases and the full HTTP flow with fakes of the domain ports.

### Why resumable SSE instead of WebSocket

The choice between WebSocket and Server-Sent Events (SSE) was settled in favor of SSE: the communication is
one-directional (server → client, token by token), and SSE already handles automatic reconnection natively in the
browser (`EventSource`), without having to reimplement that on top of a raw WebSocket.

The extra requirement was: if the connection drops mid-answer (the LLM still generating), the client needs to be
able to resume exactly where it left off, without losing or repeating any text. To make that work:

1. Every generation runs in the background, **decoupled from the HTTP connection** that triggered it. `POST
   /api/chats/:chatId/messages` only creates the message and returns `202 Accepted` with its IDs; a separate SSE
   endpoint (`GET .../messages/:messageId/stream`) is what actually reads the answer.
2. Generated text is grouped into small batches (by time or size, see `ChunkBatcher`), and each batch is
   **persisted to MongoDB before being published** to whoever is listening live (`message_chunks`, each with an
   increasing `seq`). Persisting before publishing guarantees there is never a window where a chunk was shown live
   but would be lost on reconnect.
3. Every SSE chunk event carries its `seq` as the event's `id:` — the standard SSE mechanism for this: the
   browser's `EventSource` automatically resends that last id as a `Last-Event-ID` header when it reconnects. The
   server reads that header (or a `lastEventId` query parameter, for the first manual connect) and, on reconnect,
   replays only the chunks with a higher `seq` — read from MongoDB — before following the live generation again.
   This is covered by an end-to-end test and was also validated manually against the real Kimi API: dropping the
   connection mid-answer and reconnecting with `Last-Event-ID` resumes from exactly the next chunk, without
   repeating anything.
4. Each chat allows only **one active generation at a time** (enforced by a partial unique index in MongoDB, not
   just in memory): a second attempt to send a message while the first is still generating gets `409 Conflict`.
5. Heartbeats (`: ping`) are sent periodically on the SSE connection because Kimi K3 always "thinks" before its
   first token, and a proxy in front of the API (e.g. Cloudflare) closes idle connections — without a heartbeat,
   the connection would drop before the answer even started arriving.
6. Rows in `message_chunks` have a 24h TTL: they only exist to allow resuming a stream, they are not the source of
   truth — the final, complete text lives in `messages.content`.

### User identity: fingerprint, not IP

The API sits behind a reverse proxy, so the client IP the server sees isn't reliable for identifying users (it can
be the proxy's IP, or vary between requests from the same person). Identity is instead the fingerprint generated in
the browser via FingerprintJS, sent in an `X-Fingerprint` header — no sign-up, no password, just that identifier.
An upstream-provided client IP, when available, is optionally stored on the user document as informational
metadata only; it is never used to decide rate limiting or authentication.

### RAG: why Mistral embeddings over the existing collection

The knowledge base already existed before this backend: a MongoDB collection where each document holds
`{ text, embedding, title, chunk_index, chunk_size }`, with an Atlas Vector Search index already created over the
`embedding` field, 1024 dimensions, cosine similarity. That same dimensionality (1024) is what Mistral's
`mistral-embed` model produces — which is why the embedding model wasn't a free choice: it had to be compatible
with the vectors already indexed. This was validated in practice before considering the integration done: embedding
the text of an existing chunk and running `$vectorSearch` against it returns that same chunk first, with a score of
roughly 1.0.

The search (`ChunkedDataRepository.vectorSearch`, used by `RagRetriever`) uses `$vectorSearch` + `$project` with
`{ $meta: "vectorSearchScore" }`, filtering by a minimum score threshold (`RAG_SCORE_THRESHOLD`). Note that
Atlas' score for cosine similarity is normalized as `(1 + cos) / 2`, different from the raw cosine similarity used
by the earlier command-line prototype this project is based on — its `0.6` threshold corresponds to roughly `0.8`
here.

Known limitation in this first version: retrieval only uses the user's latest question, not the conversation
history, so very short follow-up questions tend to retrieve poorly. Rewriting the query using the history before
searching is a natural improvement for later.

### The prompt lives in the database, not hardcoded

The system prompt and the user-message template (which injects the retrieved context) live in a configuration
collection in MongoDB (`app_config`), not in the code. This makes it possible to edit the assistant's behavior
without a new deploy — just a write to the database. `ConfigRepository` keeps a short-lived in-memory cache
(60s by default) so it doesn't hit the database on every message while still picking up changes quickly.
`scripts/seed-config.ts` populates the default values the first time (idempotent; `--force` overwrites).

### Two LLM providers behind a single port

`ILLMClient` is the domain port; `KimiClient` and `MistralClient`, under `infra/clients`, are its two
implementations, selected at runtime by an environment variable (`LLM_PROVIDER=KIMI` or `MISTRAL`) through
`llmClientFactory`. Only the selected client is instantiated — switching providers doesn't require the other
provider's API key.

- **Kimi K3** (the default) is used through the `openai` SDK pointed at Moonshot's OpenAI-compatible endpoint. The
  model always "thinks" before answering and has several sampling parameters fixed (`temperature`, `top_p`, `n`,
  penalties) that the API rejects if sent — so the client never sends them; only `reasoning_effort` is optional and
  configurable. Only the final text (`delta.content`) is forwarded to the user; the model's internal reasoning
  (`delta.reasoning_content`) is discarded.
- **Mistral** uses the official SDK (`@mistralai/mistralai`), streaming through `chat.stream`.

Embeddings used for RAG are **always** generated by Mistral (`mistral-embed`), regardless of which provider is
used for completions — switching `LLM_PROVIDER` to `KIMI` doesn't remove the need for `MISTRAL_API_KEY`.

### Data model

| Collection | Contents | Indexes |
|---|---|---|
| `users` | one document per fingerprint | unique on `fingerprint` |
| `chats` | one chat per conversation, with `userId` (the fingerprint) and a title derived from the first question | `{userId, updatedAt}` |
| `messages` | each message (`user`/`assistant`), with a `status` (`pending`/`streaming`/`done`/`failed`), the sources retrieved by RAG, and the final text | `{chatId, createdAt}`, `{userId, role, createdAt}` (used by the rate limit), a partial unique index preventing two active generations in the same chat |
| `message_chunks` | text batches of an in-progress generation, used to resume a dropped stream | unique `{messageId, seq}`, 24h TTL |
| `app_config` | system prompt and templates, editable without a deploy | unique on `key` |
| the RAG collection | *(pre-existing, not managed by this backend)* the documents indexed for retrieval | Atlas Vector Search index |

## Running locally

```bash
cd backend
pnpm install
cp .env.example .env   # fill in MONGO_URL, MISTRAL_API_KEY and KIMI_API_KEY
pnpm seed-config        # populates the default prompt in app_config (idempotent)
pnpm dev                 # starts with watch mode (tsx)
```

Environment variables are documented in `backend/.env.example`. The most relevant ones: `MONGO_URL`, `LLM_PROVIDER`
(`KIMI` by default), `RATE_LIMIT_MAX_MESSAGES` / `RATE_LIMIT_WINDOW_MINUTES`, `RAG_RETRIEVE_K` /
`RAG_SCORE_THRESHOLD`.

## Testing

```bash
cd backend
pnpm typecheck   # tsc --noEmit
pnpm lint-fix    # eslint --fix + prettier --write
pnpm test        # vitest
pnpm build       # tsc -p tsconfig.build.json
```

The test suite uses in-memory fakes of the domain ports (`test/fakes.ts`) to exercise the full HTTP flow without
depending on a real MongoDB instance — including the SSE drop-and-resume scenario, rate limiting, per-user
isolation, and the "chat busy" (409) behavior during an in-progress generation.
