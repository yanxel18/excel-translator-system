# Production deployment

## Requirements

- Docker Engine with the Compose plugin.
- A reachable Ollama instance with the configured model available.
- Node.js 22 or newer only when running the build or test scripts outside Docker.

## Start the services

1. Copy the repository root `.env.example` to `.env`.
2. Set unique, long values for `POSTGRES_PASSWORD`, `AUTH_PASSWORD`, and `JWT_SECRET`. Use a URL-safe value for `POSTGRES_PASSWORD` because Compose inserts it into both the PostgreSQL setting and the connection URL; `openssl rand -hex 32` produces a suitable database password.
3. Set `WEB_ORIGIN` and `VITE_API_URL` to the public origins used by the browser. `WEB_ORIGIN` is the exact frontend origin; `VITE_API_URL` includes the API base path.
4. Set `OLLAMA_URL` to the address reachable from the API container. When Ollama runs on the Docker host, the default `host.docker.internal` address is configured.
5. Start the services with `docker compose up --build -d`.

The frontend is served at `/excel-convert/`, the API health endpoint is `/excel-convert`, and the GraphQL endpoint is `/excel-convert/graphql`. PostgreSQL migrations are applied by the API container before it starts. PostgreSQL data and uploaded workbooks persist in named Docker volumes. With the default `AUTH_BOOTSTRAP_ENABLED=true`, the API creates the configured local account at its first successful username login if that account does not exist yet; it never overwrites an existing account.

The frontend base path and API base path are configured separately using `VITE_BASE_PATH` and `BASE_PATH`; keep both set to `/excel-convert` for the supplied nginx configuration and health check. If the service is exposed through a TLS reverse proxy, forward the `/excel-convert` path and set `WEB_ORIGIN` and `VITE_API_URL` to the public HTTPS addresses.

**Migration encoding correction (2026-11-12):** Six historical changelog migrations had a UTF-8 byte-order marker removed because PostgreSQL rejected it during a fresh deployment. Their SQL and published entries are unchanged, but databases that applied the original files retain the old checksums. In a disposable PostgreSQL 16 rehearsal, Prisma 7.10.1 `migrate status` and `migrate deploy` succeeded with an old stored checksum; `migrate dev` was not tested. Review migration history and back up the database before development migration operations; do not manually rewrite `_prisma_migrations` to silence a mismatch.

## Migration and recovery checks

The API container applies pending Prisma migrations before serving requests. Back up `postgres-data` and `api-data` together before upgrading, then inspect `docker compose logs --no-color translator-api` for migration and startup results. The Version 2 branding/footer migration only inserts its stable Changelog entry; the public `/excel-convert/system/info` endpoint returns the current Asia/Tokyo calendar year with `Cache-Control: public, max-age=300`. The footer refreshes on that cache interval, so a displayed year may remain cached for up to five minutes after Tokyo midnight.

If a migration fails, keep the database and logs intact, confirm the migration status with the database operator, and use a reviewed forward migration or restore the paired volume backup if recovery requires rollback. Do not use `prisma migrate dev` or `migrate reset` against production, delete application data, or edit `_prisma_migrations` to make a failed deployment appear successful. After recovery, redeploy the reviewed image and verify API readiness, the system-info response, and an authenticated workbook workflow before returning traffic.

## Translation concurrency and recovery

Set `MAX_CONCURRENT_TRANSLATIONS` to an integer from `1` to `5` (default `5`). It is validated at API startup. Starts and retries share one global limit across owners; when at capacity, the API returns HTTP `409` rather than queueing work. Change the setting in the deployment environment and restart the API to apply it.

Run only one API instance against a database. The API holds a PostgreSQL advisory lock for its lifetime and refuses startup if another instance already holds it; a lost lock connection terminates the process. Do not scale `translator-api` beyond one replica or run a second API process against the same database. The Compose file defines one API container.

After startup has acquired the singleton lock, persisted `PROCESSING` jobs are marked `FAILED` with a message that permits retry; this recovers jobs interrupted by a process or host restart without permanently consuming a slot. A running cancellation continues to occupy capacity until the worker stops. Completion, failure, and settled cancellation release capacity. Check the API logs for the startup lock failure or interrupted-job messages. A start/retry rejected at capacity should be retried after a slot becomes available.

## Keycloak OIDC

Set `ADMIN_USERNAMES` to a comma-separated list of administrator login names. These names are checked by the API for both protected setting endpoints and the admin-only section in Profile. An administrator can configure Keycloak there; the settings are stored in PostgreSQL and take effect for new sign-ins. The public login page receives only the enablement, server URL, realm, and client ID. `KEYCLOAK_*` environment values provide the initial/default config when no admin settings have been saved.

The browser client must be a public Keycloak client with Standard Flow enabled, PKCE using S256, the app URL in its valid redirect URIs, and the app origin in Web Origins. The Keycloak token is verified by the API and exchanged for an application JWT; the browser adapter keeps Keycloak tokens in memory. Existing local accounts are not automatically merged with Keycloak identities. Authentication mode is stored in PostgreSQL: LOCAL disables provider sign-in, OIDC uses Keycloak, and HYBRID keeps both methods available. Remote Keycloak and issuer URLs must use HTTPS; HTTP is accepted only for loopback development.

If a provider configuration locks out administrators, first take a database backup, then have an operator with direct database access switch the persisted setting to LOCAL:

```sql
INSERT INTO "OidcSettings" ("id", "mode", "enabled", "updatedAt")
VALUES ('default', 'LOCAL', false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET "mode" = 'LOCAL', "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP;
```

Local sign-in also requires `LOCAL_AUTH_ENABLED=true` and an enabled local-password account whose username appears in `ADMIN_USERNAMES`. If either prerequisite is absent, restore a usable local administrator through the approved operator process before switching modes; never put passwords in SQL or logs. Once access is restored, correct the provider configuration and select the intended mode through the administrator settings API.

## ibisOffice preview

The optional `ibis-preview` Compose service serves the pinned, unmodified ibisOffice browser release. Start it with `docker compose --profile preview up --build -d`; it is available at `http://localhost:8081`. The Docker web build uses the same-origin `/preview/` proxy, including over Tailscale HTTPS; for other web builds, set `VITE_PREVIEW_URL` to a browser-reachable absolute URL or same-origin path and rebuild. History preview embeds `bridge.html` from that service with the full ibisOffice spreadsheet interface in read-only mode. The application fetches workbook bytes through its authenticated owner-scoped endpoint and transfers them to the iframe with exact origin/window checks; bearer credentials are never sent to the preview service. The existing bounded cell table remains below the iframe as a fallback. A current WebGPU-capable browser and HTTPS (or localhost during development) are required. If the optional service is stopped, the dialog reports that it is unavailable.

The preview Dockerfile downloads and checksum-verifies the pinned prebuilt Web bundle, including Wasm and assets. Cloning the Rust repository and copying the source tree into nginx does not compile a runnable browser bundle. The small local `bridge.html` adapter feeds the transferred bytes to the upstream open flow without changing the upstream Web files.

The container retains the upstream `license.md` and notice assets. ibisOffice is dual-licensed under AGPL-3.0-only and a commercial license. Review the upstream license terms for the deployment model before distributing or offering the preview service.

## Operations

- Back up the `postgres-data` and `api-data` volumes together. The database references workbook paths under `DATA_DIR`.
- To update the application, pull the reviewed source revision and run `docker compose up --build -d`.
- Inspect startup and migration output with `docker compose logs -f translator-api`.
- The API container health check reports readiness at `/excel-convert`; the frontend serves the same application beneath `/excel-convert/`.
- Do not use the example passwords or JWT secret in a deployed environment. Disable local authentication when the configured OIDC provider is ready and set its issuer, client ID, and required group.
