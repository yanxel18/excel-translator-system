# Frontend

The React, TypeScript, Mantine and Vite application provides the workspace, history, notifications, vocabulary, profile and changelog. API clients are in `src/api`; screens are in `src/features`.

## Local development

Use Node.js 22+ and npm. Start PostgreSQL, Ollama and the API as described in the [backend guide](../api/README.md). From this directory:

```sh
cp .env.example .env
npm ci
npm run dev
```

Example `.env`:

```dotenv
VITE_API_URL=http://localhost:3000/excel-convert
VITE_BASE_PATH=/excel-convert/
VITE_PREVIEW_URL=http://localhost:8081/
```

Open `http://localhost:5173/excel-convert/`. The API and preview URLs must be reachable by the browser. Run `npm run build` to build production assets and `npm run preview` to serve the build. Vite variables are embedded during the build; rebuild after changing them. Set the API's `WEB_ORIGIN` to the exact frontend origin.

## Docker

From the repository root, `docker compose up --build -d translator-web` starts the frontend and its API and database dependencies. Add `--profile preview` to include the optional preview service. Keep the supplied base path with the bundled nginx configuration. See the [root guide](../../../README.md) for configuration and service commands.
