# Excel Translator

Excel Translator is a React and NestJS application for translating Japanese strings in `.xlsx` workbooks through a local Ollama model.

## Run locally

Requirements: Node.js 22+, npm, and Ollama with a model pulled (the default is `gemma4:latest`).

1. Start Ollama and make sure its API is available at `http://localhost:11434`.
2. In `project/apps/api`, run `npm ci`, `npm run build`, and `npm start`.
3. In `project/apps/web`, run `npm ci` and `npm run dev`.
4. Open `http://localhost:5173` and sign in with the local development account `user` / `password`.

The API listens on port 3000. Set `AUTH_USERNAME`, `AUTH_PASSWORD`, and `JWT_SECRET` before exposing it beyond a local development environment. Optional settings: `OLLAMA_URL`, `OLLAMA_MODEL`, `PORT`, and `DATA_DIR`.

To run the production containers with Docker Compose, copy `.env.example` to `.env`, replace the database password, local account password, and JWT secret, then run `docker compose up --build -d`. The web app is served from `/excel-convert/`; the API is served from `/excel-convert` on port 3000 and the web app on port 5173. Compose waits for PostgreSQL, applies Prisma migrations, and then starts the API. Set `OLLAMA_URL` to the Ollama host reachable by the API container.

To run the optional ibisOffice browser preview service, start Compose with `docker compose --profile preview up --build -d`. The service is available on port 8081 by default. It serves the unmodified, checksum-pinned upstream web release; open it and select a workbook in the browser. The browser preview needs WebGPU support. ibisOffice is dual-licensed under AGPL-3.0-only and a commercial license; keep the bundled `license.md` and notices, and review the upstream terms for your deployment.

Deployment settings are listed in the root `.env.example`. The API and web app also keep app-local `.env.example` files for development. The configured `BASE_PATH` and `VITE_BASE_PATH` must match `/excel-convert` for this deployment's nginx and API health checks.

Run `npm run build` for both applications and `npm test` for API checks. `npm run test:playwright` also runs the browser sign-in check and requires Playwright Chromium. With both services and Ollama running, `npm --prefix project/apps/api run smoke` exercises upload, translation, patching, and download.

Run `npm run test:frontend` for the mocked Playwright flow covering workspace navigation, localization, and theme switching on a narrow screen.

## Current behavior

- Authenticated XLSX upload with a 50 MB file limit, archive expansion checks, and malformed archive rejection.
- Extraction and translation of shared and inline strings, including rich text runs. A translated rich-text string is placed in its first non-empty run; run-specific formatting cannot be mapped to translated word boundaries.
- Translation is sent to Ollama in bounded batches and translation IDs are checked before the workbook is patched.
- Jobs are persisted to `project/apps/api/data`, scoped to the authenticated user, and support progress refresh, cancellation, retry after failure, and download after successful patching.
- A failed or incomplete translation never produces a downloadable completed job.

Translation jobs and account data are stored in PostgreSQL through Prisma; source and output workbooks are kept in the API data directory. History, profiles, notifications, and changelog data are also available through the GraphQL HTTP endpoint. Progress refresh currently uses polling. Apollo and Socket.IO push updates are not implemented. Comments, drawings, and other OOXML text parts are not translated.

See [production deployment](project/docs/DEPLOYMENT.md), [requirements](project/REQUIREMENTS.md), and [architecture](project/docs/ARCHITECTURE.md) for setup and system details.
