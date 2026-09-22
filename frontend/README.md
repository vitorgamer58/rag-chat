# RAG Chat — Frontend

A ChatGPT-like chat interface for the RAG Chat backend: ask a question and get a streamed, sourced answer in a clean, minimal UI.

Built with Vue 3, TypeScript and Vite, using Server-Sent Events for live token streaming and Pinia for state.

## Setup

```sh
npm install
```

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the backend's URL.

### Development

```sh
npm run dev
```

### Build for production

```sh
npm run build
```

### Run unit tests

```sh
npm run test:unit
```

### Lint

```sh
npm run lint
```
