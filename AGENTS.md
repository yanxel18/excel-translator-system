# Project contribution rules

## Changelog every project update

Every completed project update must have a clear, user-readable entry in the Changelog. This includes feature work, behavior changes, fixes, UI changes, configuration, and deployment changes. Do not finish an update without recording it.

The Changelog page is database-backed, with a built-in timeline for empty databases. For each update:

1. Add one historical entry in a new Prisma migration under `project/apps/api/prisma/migrations/`. Use a stable unique ID, a concise title, a plain-language summary, and the update date.
2. Add the same entry to `initialHistory` in `project/apps/web/src/features/changelog/ChangelogPage.tsx`, keeping newest entries first. This keeps the UI populated before migrations have run.
3. Keep the database and built-in entries in sync. Do not rewrite or delete published history to describe later work.

When several related changes are completed together, record them in one entry that summarizes the user-visible result.

## Refresh the development stack after fixes

After each fix that changes application code or runtime configuration, rebuild and start the local development stack from the repository root with `docker compose up --build -d`. Confirm the services are running and healthy with `docker compose ps`, and check the application at `http://localhost:5173/excel-convert/` before reporting the fix complete. If the build or startup fails, inspect the relevant service logs and report the failure instead of claiming the update is available. This is for the local development stack only; do not deploy to production or remove named volumes.

## UI preferences

- Use Poppins with a readable 16px default body size; keep secondary metadata legible.
- Give search inputs a leading search icon and an accessible clear action when populated.
- Keep notification previews compact while using icons large enough to read at a glance.
- Separate the top bar and sidebar from the page canvas with shared semantic tokens in both light and dark themes.
- Preserve visible keyboard focus, responsive layouts, and accessible contrast when changing visual styles.

## Remote previews

- Keep remote development previews private to the authenticated Tailscale tailnet.
- Do not enable Tailscale Funnel, public port forwarding, or another public exposure path without explicit approval.
- If Tailscale is unavailable or unauthenticated, report the blocker instead of exposing the app publicly or embedding an auth key.
