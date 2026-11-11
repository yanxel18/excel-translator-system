# Project contribution rules

## Changelog every project update

Every completed project update must have a clear, user-readable entry in the Changelog. This includes feature work, behavior changes, fixes, UI changes, configuration, and deployment changes. Do not finish an update without recording it.

The Changelog page is database-backed, with a built-in timeline for empty databases. For each update:

1. Add one historical entry in a new Prisma migration under `project/apps/api/prisma/migrations/`. Use a stable unique ID, a concise title, a plain-language summary, and the update date.
2. Add the same entry to `initialHistory` in `project/apps/web/src/features/changelog/ChangelogPage.tsx`, keeping newest entries first. This keeps the UI populated before migrations have run.
3. Keep the database and built-in entries in sync. Do not rewrite or delete published history to describe later work.

When several related changes are completed together, record them in one entry that summarizes the user-visible result.
