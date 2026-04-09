# AutoScribe AI+ Workspace

## Overview

Full-stack AI assistant workspace — **AutoScribe AI+** — a next-gen smart report, code, and insight generator. Built as a pnpm monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS (dark theme, glass effects)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2 for generation)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Architecture

### Frontend (`artifacts/autoscribe/`)
- React + Vite app with dark/light theme toggle (next-themes)
- Login page with email/password + "Continue as Guest" option
- Main dashboard: left sidebar (chats, saved, stats), center chat panel, right insights panel
- Multi-mode AI: Report, Code, Documentation, Insight
- File upload (TXT/CSV), Voice input (SpeechRecognition API)
- Output tabs, keyword highlighting, copy + download
- Smart suggestions after AI responses
- Share link generation for outputs
- Framer Motion animations throughout

### Backend (`artifacts/api-server/`)
- Express 5 API server with routes:
  - `GET/POST /api/chats` — chat session management
  - `GET/PATCH/DELETE /api/chats/:id` — single chat ops
  - `GET /api/chats/:chatId/messages` — chat messages
  - `POST /api/generate` — AI generation (multi-mode)
  - `POST /api/upload` — file upload (TXT/CSV parsing)
  - `GET/POST /api/saved` — saved outputs
  - `DELETE /api/saved/:id` — delete saved output
  - `POST /api/share` — create share link
  - `GET /api/share/:token` — get shared output
  - `GET /api/stats` — usage statistics

### Database (`lib/db/`)
- Tables: `chats`, `messages`, `saved_outputs`, `share_links`, `files`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## AI Integration

Uses Replit AI Integrations for OpenAI access. Environment variables `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` are automatically managed by Replit. No user API keys required.

## Features

1. **Multi-Mode AI**: Report, Code, Documentation, Insight — same input, different structured output
2. **File Upload**: TXT and CSV parsing, sends file content to AI
3. **Voice Input**: Browser SpeechRecognition API fills input box
4. **Output Tabs**: Report | Code | Docs | Insights presentation
5. **Copy + Export**: Copy button, download as TXT
6. **Smart Suggestions**: Follow-up action chips after AI response
7. **Quick Actions**: Summarize, Explain, Generate Code, Extract Keywords
8. **Keyword Highlighting**: Important terms highlighted in AI output
9. **Chat History**: Stored in DB, renameable sessions
10. **Save Outputs**: Pin important AI responses
11. **Share Links**: Generate unique public URL for any output
12. **Dark/Light Mode**: Toggle with next-themes
13. **Loading Animation**: Framer Motion thinking indicator

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
