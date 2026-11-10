# Excel Translator Tasks

## Foundation

- [x] Task 1: Add production configuration, service names, Docker PostgreSQL, and Prisma schema.
  - Acceptance: PostgreSQL models define keys, relationships, uniqueness, and query indexes; all service URLs and secrets have example environment variables.
  - Verify: Prisma schema validates and compose configuration renders.

- [x] Task 2: Replace local credential checks with persistent users, password hashes, and JWT/OIDC identity boundaries.
  - Acceptance: Local users authenticate with a stored password hash; Keycloak access tokens are verified through configured discovery and required group claims.
  - Verify: Focused authentication tests and API build pass.

## Translation workflow

- [x] Task 3: Persist translation jobs, source/output files, sheet selections, language choices, and status notifications.
  - Progress: Job settings are owner-scoped and persisted; worksheet selection is honored during extraction and patching, including shared strings referenced by unselected sheets. Language choices drive translation prompts. Starts and retries are claimed atomically, lifecycle notifications are stored and shown in a paginated feed, and jobs interrupted by an API restart become retryable failures.
  - Acceptance: Jobs are owner-scoped, retry-safe, durable across restarts, and visible in history.
  - Verify: Job lifecycle tests and API build pass.

- [ ] Task 4: Add worksheet discovery/selection, supported language pairs, vocabulary CRUD, and protected-term translation.
  - Acceptance: A user selects sheets, language pair, and a compatible vocabulary group before starting translation.
  - Verify: Extraction, vocabulary, and language-validation tests pass.

- [ ] Task 5: Harden OOXML patching and output validation.
  - Acceptance: Shared/inline rich text, number formats, formulas, and selected sheets are preserved; generated archives pass OOXML structural checks before publication.
  - Verify: XLSX fixture tests and API build pass.

## Product surfaces

- [ ] Task 6: Deliver history, preview, download/delete, profile, notification, and changelog APIs plus GraphQL query/mutation surfaces.
  - Progress: Owner-scoped notification listing and mark-as-read endpoints are available; the other surfaces remain.
  - Acceptance: Lists are paginated and owner-scoped; preview is authorized; notification pagination works.
  - Verify: API integration tests and schema generation pass.

- [ ] Task 7: Complete the Mantine frontend views for workspace setup, history, vocabulary, notifications, profile, changelog, localization, and dialogs.
  - Acceptance: All navigation destinations are functional, responsive, localized, themed, and use skeleton loaders.
  - Verify: Frontend typecheck, build, and Playwright flows pass.

## Deployment and quality

- [ ] Task 8: Add source-mirrored backend/frontend tests, root deployment files, ibis preview service, base-path support, and production documentation.
  - Acceptance: Services run from `/excel-convert`, example environment files are complete, and all tests/builds pass.
  - Verify: Docker Compose config, API/frontend builds, and test suites pass.
