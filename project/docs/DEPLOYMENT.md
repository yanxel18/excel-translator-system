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

## Keycloak OIDC

Set `ADMIN_USERNAMES` to a comma-separated list of administrator login names. These names are checked by the API for both protected setting endpoints and the admin-only section in Profile. An administrator can configure Keycloak there; the settings are stored in PostgreSQL and take effect for new sign-ins. The public login page receives only the enablement, server URL, realm, and client ID. `KEYCLOAK_*` environment values provide the initial/default config when no admin settings have been saved.

The browser client must be a public Keycloak client with Standard Flow enabled, PKCE using S256, the app URL in its valid redirect URIs, and the app origin in Web Origins. The Keycloak token is verified by the API and exchanged for an application JWT; the browser adapter keeps Keycloak tokens in memory. Existing local accounts are not automatically merged with Keycloak identities.

## ibisOffice preview

The optional `ibis-preview` Compose service serves the pinned, unmodified ibisOffice browser release. Start it with `docker compose --profile preview up --build -d`; it is available at `http://localhost:8081`. Set `VITE_PREVIEW_URL` to the browser-reachable preview origin and rebuild `translator-web`. History preview embeds `bridge.html` from that service with the full ibisOffice spreadsheet interface in read-only mode. The application fetches workbook bytes through its authenticated owner-scoped endpoint and transfers them to the iframe with exact origin/window checks; bearer credentials are never sent to the preview service. The existing bounded cell table remains below the iframe as a fallback. A current WebGPU-capable browser and HTTPS (or localhost during development) are required. If the optional service is stopped, the dialog reports that it is unavailable.

The preview Dockerfile downloads and checksum-verifies the pinned prebuilt Web bundle, including Wasm and assets. Cloning the Rust repository and copying the source tree into nginx does not compile a runnable browser bundle. The small local `bridge.html` adapter feeds the transferred bytes to the upstream open flow without changing the upstream Web files.

The container retains the upstream `license.md` and notice assets. ibisOffice is dual-licensed under AGPL-3.0-only and a commercial license. Review the upstream license terms for the deployment model before distributing or offering the preview service.

## Operations

- Back up the `postgres-data` and `api-data` volumes together. The database references workbook paths under `DATA_DIR`.
- To update the application, pull the reviewed source revision and run `docker compose up --build -d`.
- Inspect startup and migration output with `docker compose logs -f translator-api`.
- The API container health check reports readiness at `/excel-convert`; the frontend serves the same application beneath `/excel-convert/`.
- Do not use the example passwords or JWT secret in a deployed environment. Disable local authentication when the configured OIDC provider is ready and set its issuer, client ID, and required group.
