# Excel Translator

Excel Translator is a React and NestJS application for translating Japanese strings in `.xlsx` workbooks through a local Ollama model.

## Run locally

Requirements: Node.js 18+, npm, and Ollama with a model pulled (the default is `gemma4:latest`).

1. Start Ollama and make sure its API is available at `http://localhost:11434`.
2. In `project/apps/api`, run `npm ci`, `npm run build`, and `npm start`.
3. In `project/apps/web`, run `npm ci` and `npm run dev`.
4. Open `http://localhost:5173` and sign in with the local development account `user` / `password`.

The API listens on port 3000. Set `AUTH_USERNAME`, `AUTH_PASSWORD`, and `JWT_SECRET` before exposing it beyond a local development environment. Optional settings: `OLLAMA_URL`, `OLLAMA_MODEL`, `PORT`, and `DATA_DIR`.

To run with Docker Compose from this folder, use `docker compose up --build`. The compose file points the API container to the host Ollama service and publishes ports 3000 and 5173.

Run `npm run build` for both applications and `npm test` for API checks. `npm run test:playwright` also runs the browser sign-in check and requires Playwright Chromium. With both services and Ollama running, `npm --prefix project/apps/api run smoke` exercises upload, translation, patching, and download.

## Current behavior

- Authenticated XLSX upload with a 50 MB file limit, archive expansion checks, and malformed archive rejection.
- Extraction and translation of shared and inline strings, including rich text runs. A translated rich-text string is placed in its first non-empty run; run-specific formatting cannot be mapped to translated word boundaries.
- Translation is sent to Ollama in bounded batches and translation IDs are checked before the workbook is patched.
- Jobs are persisted to `project/apps/api/data`, scoped to the authenticated user, and support progress refresh, cancellation, retry after failure, and download after successful patching.
- A failed or incomplete translation never produces a downloadable completed job.

The job store is a local disk store for this working build. Prisma/PostgreSQL, GraphQL/Apollo, Socket.IO push updates, and the frontend TanStack Query, i18next, and Zustand integrations described in `project/REQUIREMENTS.md` have not been implemented yet. Progress refresh currently uses polling. Comments, drawings, and other OOXML text parts are not translated.

See [requirements](project/REQUIREMENTS.md) and [architecture](project/docs/ARCHITECTURE.md) for the target specification.
