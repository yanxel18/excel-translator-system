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

## Maintenance schedule API

The API stores exactly one maintenance schedule in PostgreSQL. The initial
schedule is disabled and has no window. The existing global API base path
applies to both routes (for example, `/excel-convert`):

| Method and route | Permission | Result |
|---|---|---|
| `GET /admin/maintenance-schedule` | Administrator bearer token | Current full schedule; initially `{ "enabled": false, "startsAt": null, "endsAt": null }` |
| `PUT /admin/maintenance-schedule` | Administrator bearer token | Replaces the schedule and returns its saved values |
| `GET /maintenance-notice` | Any authenticated bearer token | `200` with `{ "active": true, "startsAt": "...", "endsAt": "..." }` while active, or `{ "active": false }` otherwise |

Send a complete schedule for every `PUT`, including when disabling it:

```json
{
  "enabled": true,
  "startsAt": "2026-11-15T17:00:00+09:00",
  "endsAt": "2026-11-15T18:00:00+09:00"
}
```

`startsAt` and `endsAt` must be valid RFC 3339 date-times with `Z` or a numeric
UTC offset, uppercase `T`, seconds from `00` through `59`, and at most
millisecond precision. Zone-less dates,
date-only strings, invalid calendar values, and the unknown-offset marker
`-00:00` are rejected with `400`. The end instant must be later than the start.
Accepted offsets are normalized to UTC and returned as ISO timestamps ending
in `Z`; the database stores absolute `TIMESTAMPTZ` instants, not the submitted
offset or a named time zone. Clients should label whichever time zone they
use when displaying a schedule; converting for display never changes the
stored schedule.

A notice is active exactly when it is enabled and `startsAt <= now < endsAt`.
Its start is inclusive and its end is exclusive. Disabled, future, expired,
and not-yet-configured schedules produce `{ "active": false }`; the public
route does not disclose their saved dates or enabled state. The API does not block
sign-in, uploads, translations, or other application access during a notice.
Schedule responses use `Cache-Control: no-store`; administrator changes are
recorded in the management audit log. Unauthenticated requests receive `401`,
non-administrators receive `403` on management routes, and invalid input
receives `400`.

Focused verification: `npm run test:maintenance`.

## Docker and operations

From the repository root, `docker compose up --build -d translator-api` starts the API and healthy PostgreSQL dependency. Migrations run before the API starts. Configure an Ollama address reachable from the container. Use `docker compose logs -f translator-api` for startup and migration output. Back up both named volumes because database records refer to workbook files. See the [deployment guide](../../docs/DEPLOYMENT.md) for authentication, preview and operations.

## Translation usage

Job history shows input text usage after extraction and output usage after a
successful translation. Counts are Unicode code points in extracted strings,
not cells: shared strings referenced more than once are counted once. Estimates
are the total UTF-8 bytes divided by four, rounded up; they are rough text
equivalents, not Ollama's actual prompt or completion token counts, and accuracy
varies by language and model. Vocabulary markers, prompt instructions, retries,
and protocol overhead are excluded. The profile dashboard sums measured
completed jobs owned by the signed-in user. Failed attempts are not included;
older jobs without measurements remain unavailable rather than being treated
as measured zero. Deleting a job removes it from the dashboard totals.
The dashboard chart groups completed jobs by their completion date in the
viewer’s local time over the last seven calendar days; its cards show all-time
totals. Days containing jobs without recorded usage are marked as incomplete.
