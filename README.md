# Excel Translator

Excel Translator translates `.xlsx` workbooks with Ollama. The React/Vite frontend talks to a NestJS API. PostgreSQL and Prisma store users, jobs, history, notifications and settings; workbook files are stored on disk. Progress is polled. An optional ibisOffice container provides browser preview.

## Requirements

Install Docker with Compose and start a reachable Ollama server. Pull the configured model, for example `ollama pull gemma4:latest`. Ollama is external to Compose. Local development also requires Node.js 22+ and npm.

## Start the stack

Copy `.env.example` to `.env` in the repository root. Keep its defaults and set these example local values:

```dotenv
POSTGRES_DB=excel_translator
POSTGRES_USER=excel_translator
POSTGRES_PASSWORD=localdbpassword
JWT_SECRET=local-development-signing-secret-change-before-deployment
AUTH_USERNAME=user
AUTH_PASSWORD=localpassword
AUTH_BOOTSTRAP_ENABLED=true
ADMIN_USERNAMES=user
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=gemma4:latest
VITE_API_URL=http://localhost:3000/excel-convert
VITE_BASE_PATH=/excel-convert/
WEB_ORIGIN=http://localhost:5173
```

Use unique secrets for deployment and a URL-safe database password. Ollama must be reachable from the API container; Vite URLs must be reachable from the browser.

```sh
docker compose up --build -d                           # database, API, web
docker compose --profile preview up --build -d         # include preview
docker compose up -d postgres                          # database only
docker compose up --build -d translator-api            # API and database
docker compose up --build -d translator-web            # web and dependencies
docker compose --profile preview up --build -d ibis-preview # preview only
docker compose ps
docker compose logs -f translator-api
docker compose down
```

Open `http://localhost:5173/excel-convert/`. The API health endpoint is `http://localhost:3000/excel-convert`, GraphQL is at `/excel-convert/graphql`, and optional preview is at `http://localhost:8081/`. The API waits for PostgreSQL and applies migrations before starting. The `postgres-data` and `api-data` named volumes persist database and workbook files; back them up together. `docker compose down` retains them.

Keep `BASE_PATH=/excel-convert` and `VITE_BASE_PATH=/excel-convert/` with the supplied nginx configuration and health check. Set `WEB_ORIGIN` to the exact frontend origin and `VITE_API_URL` to the browser-accessible API URL. Vite settings are embedded at build time, so rebuild the web image after changing them. When bootstrap is enabled, the local account is created on first successful login; changing its environment password does not overwrite an existing account.

## Development and architecture

Follow the [backend guide](project/apps/api/README.md) and [frontend guide](project/apps/web/README.md) for local setup and sample environments. The API source and migrations are in `project/apps/api`, the UI is in `project/apps/web`, and the optional preview image is in `deployment/ibis-preview`.

See [deployment](project/docs/DEPLOYMENT.md) for Keycloak, preview, HTTPS and operations; [architecture](project/docs/ARCHITECTURE.md) and [requirements](project/REQUIREMENTS.md) provide further design context. Preview requires WebGPU and HTTPS or localhost. Review the bundled ibisOffice license and notices before deployment.
