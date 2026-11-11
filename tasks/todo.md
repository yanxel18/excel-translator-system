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

- [x] Task 4: Add worksheet discovery/selection, supported language pairs, vocabulary CRUD, and protected-term translation.
  - Progress: Pending jobs can select sheets, any distinct supported language pair, and an owner-scoped compatible vocabulary group. Vocabulary groups and terms have authenticated CRUD endpoints and workspace forms; matching terms are protected through model translation and restored exactly in the output.
  - Acceptance: A user selects sheets, language pair, and a compatible vocabulary group before starting translation.
  - Verify: Focused extraction, vocabulary, protected-term, and language-pair tests pass.

- [x] Task 5: Harden OOXML patching and output validation; split translation code into testable frontend and backend modules.
  - Progress: ZIP safety, workbook relationships, text extraction, OOXML patching, and output checks live in focused backend modules. Formula results are excluded from translation, shared strings are cloned when selected text shares a string with another sheet or a formula, and generated archives are structurally validated before publication. Frontend API domains and workspace, settings, login, and vocabulary views are split into feature modules.
  - Acceptance: Shared/inline rich text, number formats, formulas, and selected sheets are preserved; generated archives pass OOXML structural checks before publication; frontend and backend translation code is organized into isolated, testable modules.
  - Verify: XLSX fixture and Task 4 regression tests pass; API and frontend builds pass.

## Product surfaces

- [x] Task 6: Deliver history, preview, download/delete, profile, notification, and changelog APIs plus GraphQL query/mutation surfaces.
  - Progress: History, notifications, and changelog use owner-scoped cursor pagination. Workbook preview is authorized and bounded; completed workbooks can be downloaded; history deletion removes stored workbook files. Profile read/update, notification read, and changelog APIs are available over REST and GraphQL query/mutation surfaces. Frontend APIs and history, profile, and changelog views are split into focused feature modules.
  - Acceptance: Lists are paginated and owner-scoped; preview is authorized; notification pagination works; frontend and backend surfaces are organized into modules that can be exercised independently.
  - Verify: Task 6 API route integration test, GraphQL HTTP query smoke check and schema generation, API TypeScript compilation, and frontend production build pass.

- [x] Task 7: Complete the Mantine frontend views for workspace setup, history, vocabulary, notifications, profile, changelog, localization, and dialogs.
  - Progress: Navigation, header, frame, preferences, and page views live in focused frontend feature folders. Workspace, history, vocabulary, notifications, profile, and changelog destinations work on narrow layouts; English, Japanese, and Chinese can be selected and saved; light/dark theme switching works; loading views use skeletons; Mantine buttons show action spinners; an indeterminate header bar follows API requests after a short delay; translation jobs show progress labels; motion respects reduced-motion preferences. The upload area supports drag/drop and an accessible browse action without nested interactive controls. REST notification list/read behavior is isolated under `modules/notifications` and shared by its controller and GraphQL resolver.
  - Acceptance: All navigation destinations are functional, responsive, localized, themed, and use skeleton loaders.
  - Verify: Frontend TypeScript check and production build pass; Playwright narrow-screen navigation, localization, and theme flow passes with Microsoft Edge; API Tasks 4–6 and notification service tests pass.

## Deployment and quality

- [x] Task 8: Add focused backend/frontend tests, modular code layout, root deployment files, ibis preview service, base-path support, and production documentation.
  - Progress: The frontend workspace controller and API GraphQL HTTP bootstrap are isolated under feature modules, with pure path/bootstrap helpers covered by focused tests. API tests are organized in a flat `project/apps/api/test` directory and frontend Playwright tests remain under root `tests`; tests do not mirror the source trees. Production Compose deploys the web and API under `/excel-convert`, persists PostgreSQL and workbook data in named volumes, and can start a checksum-pinned ibisOffice browser preview service. Production setup and license notes are documented.
  - Acceptance: Frontend and backend responsibilities live in focused, independently testable modules; services run from `/excel-convert`; example environment files are complete; and the tests and builds pass.
  - Verify: Docker Compose config and service image builds, API and frontend builds, backend module and API route tests, and the narrow-screen frontend flow pass.

## Requirements audit — 2026-11-11

All eight planned tasks above are checked, but that only means the scoped task list is complete. It does not mean every objective in [`../project/REQUIREMENTS.md`](../project/REQUIREMENTS.md) is implemented. The following requirements remain open or need a product decision:

- The requirements name TanStack Query, i18next, Zustand, NestJS, Apollo, and Socket.IO. The current app uses feature-local React state/custom localization, `graphql-http`, and polling; the plan does not record these technology substitutions as accepted decisions.
- Job progress is persisted and refreshed by polling, but reconnect recovery and push-based real-time progress are not established by the current plan/task evidence.
- History preview is an owner-authorized bounded cell preview in the app. The optional ibisOffice container is a separate page where a user selects a local file; it is not the API-authorized in-dialog preview described in the requirements and architecture plan.
- Requirements for history filename/date filtering and preserving text in drawings, text boxes, callouts, and supported shapes are not scheduled as completed tasks. The plan risk table explicitly says shapes and diagrams are not represented like worksheet strings.
- Task 8's source-mirrored test objective is not met by the current test directory layout, as noted above.

Track these items before making a project-wide completion claim. Update this audit when requirements are implemented or formally superseded.

## Shape translation update ? 2026-11-11

Selected-sheet DrawingML shapes, grouped shapes, text boxes, and callouts are extracted and patched. Shared drawings are cloned to preserve unselected sheets. Geometry and relationships are validated; legacy VML and SmartArt-specific text remain outside this coverage. Task 4 and Task 5 regression suites pass.
