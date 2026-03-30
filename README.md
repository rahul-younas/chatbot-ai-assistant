# Next.js Groq Chatbot

A Next.js (App Router) chatbot UI powered by the Groq API.

## Features

- **Text chat**: standard text-to-text responses
- **Reasoning mode**: toggleable “reasoning” endpoint
- **Web search mode**: returns answers with a “Sources” list
- **Image-to-text**: upload an image and ask questions about it
- **Voice chat loop**: hands-free microphone capture → transcription → response → text-to-speech playback (toggle with **Alt+V**)

## Requirements

- **Node.js**: recent LTS recommended
- **Groq API key**

## Setup

This project loads server-side secrets from a file named `local.env` (see `lib/env-server.js`). Create it in the repo root:

```bash
# local.env
GROQ_API_KEY=your_groq_api_key_here
```

Important:

- **Do not commit secrets**. `local.env` is ignored by git.
- If you accidentally committed or shared a key, **rotate it** in your Groq dashboard.

## Run locally

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## API Routes

The UI calls these server routes:

- **Text to text**: `POST /api/groq/chat/text-to-text` with `{ "prompt": "..." }`
- **Reasoning**: `POST /api/groq/chat/reasoning` with `{ "prompt": "..." }`
- **Web search**: `POST /api/groq/chat/web-search` with `{ "query": "...", "includeReasoning": true|false }`
- **Image to text**: `POST /api/groq/chat/image-to-text` as `multipart/form-data` with `image` (+ optional `prompt`)
- **Voice chat**: `POST /api/groq/chat/voice-chat` as `multipart/form-data` with `audio`

## Build & run (production)

```bash
npm run build
npm run start
```

## Deploy

- **Vercel**: add `GROQ_API_KEY` to your Project Environment Variables (or update the server env loader to use Vercel env vars directly).
- Any other platform: provide `GROQ_API_KEY` securely (recommended) or provide a `local.env` at runtime.
