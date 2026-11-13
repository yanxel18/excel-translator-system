# Backend

The NestJS API authenticates users, manages translation jobs and exposes REST and GraphQL endpoints. Prisma stores metadata in PostgreSQL; workbook files live in `DATA_DIR`. The API sends extracted text to Ollama and patches the translated workbook. See `src/modules` and `prisma/schema.prisma` for implementation details.

## Local development

Use Node.js 22+, npm, PostgreSQL and Ollama. Configure the root `.env` as described in the [root guide](../../../README.md), then run `docker compose up -d postgres` from the root to start PostgreSQL. Start Ollama and pull the configured model. From this directory:

```sh
cp .env.example .env
npm ci
npm run prisma:generate
npm run db:deploy
npm run build
npm start
```

Example local `.env`; the database credentials must match the initialized database:

```dotenv
NODE_ENV=development
PORT=3000
MAX_CONCURRENT_TRANSLATIONS=5
BASE_PATH=/excel-convert
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://excel_translator:localdbpassword@localhost:5432/excel_translator?schema=public
DATA_DIR=./data
JWT_SECRET=local-development-signing-secret-change-before-deployment
AUTH_USERNAME=user
AUTH_PASSWORD=localpassword
LOCAL_AUTH_ENABLED=true
AUTH_BOOTSTRAP_ENABLED=true
ADMIN_USERNAMES=user
KEYCLOAK_ENABLED=false
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:latest
```

These credentials are for local development. `npm run dev` starts watch mode. The health endpoint is `http://localhost:3000/excel-convert` and GraphQL is at `/excel-convert/graphql`. When enabled, bootstrap creates the configured local account on first successful login; changing the environment password does not overwrite an existing account.

## Translation capacity

`MAX_CONCURRENT_TRANSLATIONS` is an integer from `1` to `5`; it defaults to `5`. The limit counts all `PROCESSING` translation jobs in the shared database, across owners. Starts and retries are admitted atomically; when full, the API rejects the request with HTTP `409` and a capacity message instead of queuing it.

Run exactly one API instance per database. Startup holds a PostgreSQL advisory lock; another API process using the same database exits with a clear error. If the lock connection is lost, the process exits to avoid continuing without the single-instance guard. Configure the limit before starting the API and restart it to apply changes. On restart, remaining `PROCESSING` jobs are marked `FAILED` with a retryable message. A cancellation keeps its slot until the worker has stopped; completion, failure and cancellation then release capacity.

Run focused tests with `npm run test:translation-concurrency`. The test suite uses a serialized in-memory database double. `npm run test:translation-concurrency:postgres` runs the real PostgreSQL checks; set `V3_TEST_DATABASE_URL` to a migrated, loopback-only disposable database named `v3_translation_concurrency_disposable`. The integration test refuses other hosts or database names.

## Docker and operations

From the repository root, `docker compose up --build -d translator-api` starts the API and healthy PostgreSQL dependency. Migrations run before the API starts. Configure an Ollama address reachable from the container. Use `docker compose logs -f translator-api` for startup and migration output. Back up both named volumes because database records refer to workbook files. See the [deployment guide](../../docs/DEPLOYMENT.md) for authentication, preview and operations.
