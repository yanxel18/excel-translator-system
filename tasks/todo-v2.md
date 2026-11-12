# Excel Translator Todo — Version 2

Created: 2026-11-12. Status: all implementation tasks pending.
Specification: [plan-v2.md](plan-v2.md). Version 1: [todo.md](todo.md).

Work in the listed dependency order. Each task includes schema/API/UI work where necessary to deliver its stated behavior. Sizes are approximate: S = 1–2 files, M = 3–5 files; split any task that grows beyond one focused implementation session.

## Foundation and access

- [x] **V2-01 — Confirm data and access rules (S)**
  - Decide GID format/uniqueness, Base requirement, registration ownership, admin authority source, initial auth mode, and page-size options recorded in the plan.
  - Acceptance: a field/validation matrix and role/action matrix are recorded; migration backfills and last-admin protection are specified.
  - Verify: trace each requested feature to a task; inspect current admin guard and existing identity mapping.
  - Dependencies: none. Files: `tasks/plan-v2.md`, relevant API DTO specifications.

- [x] **V2-02 — Establish the V2 check baseline (S)**
  - Resolve the existing `WorkspacePage.tsx` SimpleGrid type error after confirming it is still present; record current build/test failures.
  - Acceptance: no suppressed checks; unrelated failures are explicitly tracked.
  - Verify: frontend `npx tsc --noEmit`, API/frontend builds, relevant current regression commands.
  - Dependencies: none. Files: `features/workspace/WorkspacePage.tsx`, project check configuration if needed.

- [x] **V2-03 — Centralize DTO and input validation (M)**
  - Configure server validation and reusable body/query/path constraints; mirror field limits in UI helpers.
  - Acceptance: malformed IDs, unknown fields, oversized input, invalid emails, and invalid sort/page parameters are rejected; valid CJK names remain usable.
  - Verify: focused API validation checks and builds; no password normalization or secret logging.
  - Dependencies: 01–02. Files: API bootstrap/DTO modules, frontend validation helpers.

- [x] **V2-04 — Add persistent account enablement and revocation (M)**
  - Extend User with enabled/session-version state and preserve existing accounts; enforce state across local and OIDC protected requests.
  - Acceptance: disabled users cannot obtain or continue sessions; disablement revokes local sessions; existing UUID/identity links survive migration. Password-reset revocation is owned by V2-12.
  - Verify: migration on populated data and focused authentication/guard tests for both providers.
  - Dependencies: 01–03. Files: Prisma schema/migration, authentication service/guards.

Baseline evidence (2026-11-12): frontend `npx tsc --noEmit` and web/API builds pass after the SimpleGrid fix. The notification test mock was updated for the current ten-item pagination and total count; `node --test test/notifications.test.cjs` passes (4/4). Vite reports a chunk-size warning. Runtime browser verification remains outstanding.

Implementation evidence (2026-11-12): V2-03 through V2-10 have work in progress: strict validators for management endpoints, account session revocation, browser routes, administrator settings, Base management, registration and the user list. API build, Prisma validation, web typecheck/build and 44 API regression and focused checks passed. PostgreSQL 16 rehearsal on a minimal populated legacy schema preserved users, detected normalized GID duplicates, seeded Bases and enforced deletion/uniqueness constraints. Browser, accessibility, deployed refresh, real Keycloak, full existing-database Prisma deployment and concurrent-registration checks remain outstanding. Management, authentication, profile and vocabulary REST inputs have additional validation; validation is not yet centralized across all existing endpoints, and the user edit/enable and password-reset actions belong to later tasks. These items remain unchecked until their acceptance criteria are met.

Integration progress (2026-11-12): Added validation to job, history, preview and notification boundaries and owner checks for legacy progress operations. Improved settings feedback and Base selection; a mocked mobile browser test covers management navigation and actions, and nginx nested-path fallback was tested separately. V2-03 remains open: legacy translation/extraction and GraphQL inputs still need boundary validation. Real Keycloak, populated full migration deployment, concurrent registration and live end-to-end role checks remain outstanding; no additional task is marked complete without that evidence.

Integration progress (2026-11-12, continued): Added legacy workbook and GraphQL boundary validation and an administrator Base reassignment action. A disposable PostgreSQL 16 rehearsal deployed all migrations, retained a legacy user, identity and job, tested concurrent case-insensitive email registration, Base restrictions, administrator/ordinary user access and disabled-session rejection. Six historical migration encoding markers were removed without changing their entries; checksum caveats are documented in the deployment guide. Chrome tests cover mocked management interactions and role navigation. Real Keycloak, GraphQL transport, broader input audit and actual deployed end-to-end checks remain outstanding.

Integration progress (2026-11-12, provider and transport): A disposable Keycloak 26.2.5 instance exposed a CommonJS import failure, now fixed; real signed tokens passed verification, exchange, audience/group rejection and disabled-account checks with mocked persistence. Authenticated GraphQL HTTP queries and mutations now forward arguments and ownership correctly and have transport tests. Sign-in now opens Workspace. V2-03 retains global DTO and comprehensive query validation gaps; V2-04 password-reset revocation is deferred to V2-12.

Deployed browser evidence (2026-11-12): The isolated nginx/API/PostgreSQL stack passed a 390px Chrome workflow for registration, user search, direct settings refresh, Base reassignment and Base create/edit/delete, sign-out/sign-in to Workspace, and ordinary-user denial. The Keycloak test used a real provider with mocked account persistence; password reset remains a later task.

Implementation progress (2026-11-12, first validation pass): Added shared API checks for nullable profile fields and management page sizes, rejected unknown profile fields, and mirrored documented GID/username/email/Base/password limits in the administrator forms with Japanese and Chinese errors. Password values are submitted unchanged and CJK names remain valid. API build and Prisma validation passed; focused registration/Base/profile/validation tests passed (18 passed, 1 populated-database integration test skipped because `V2_TEST_DATABASE_URL` is not configured); session-revocation, legacy REST/GraphQL, progress ownership and OIDC JWKS checks passed (13/13). Web typecheck/build passed; Vite reports the existing 581.15 kB bundle warning. Eight frontend validation-helper checks passed, but three interactive Playwright tests could not launch Chromium (`spawn UNKNOWN`), so browser verification was blocked at that point. The remaining V2-03 audit and current UI/deployed acceptance checks were still outstanding then; V2-04 reset-triggered revocation belongs to V2-12.

Follow-up completion evidence (2026-11-12): Completed the V2-03 boundary audit, including legacy translation/extraction, REST DTO/query/path inputs, GraphQL HTTP body/query allowlists, and field limits; added unknown-field and identifier/constraint regressions. API compile and complete test suite passed (54 passed, 2 skipped); the skips require `V2_TEST_DATABASE_URL` for the local disposable PostgreSQL migration/management rehearsal and `V2_TEST_KEYCLOAK_URL` plus disposable credentials for real-provider checks. Added Base duplicate-code and user-list metadata/Base/enabled-state search assertions. Edge Playwright frontend and validation suites passed (13/13), including keyboard settings navigation, `aria-current`, combined user filters, sort toggling and pagination. Root production build, web `npx tsc --noEmit`, Prisma validation and `git diff --check` passed; Vite retains the 581.47 kB chunk-size warning. Prior recorded deployed 390px workflow and PostgreSQL migration rehearsal provide the deployment/data evidence for V2-05–V2-10; they were not rerun in this follow-up. Added synchronized GraphQL transport validation changelog entries in migration `20261112110800_v2_graphql_transport_validation` and the built-in history. V2-03 and V2-05–V2-10 are checked; V2-04 remains open because password-reset session revocation is explicitly completed by V2-12 and live database/Keycloak proof is unavailable in this run. No V2-11+ work was started.

Scope alignment and final verification (2026-11-12): Per user approval, moved only password-reset session revocation from V2-04 to V2-12; password changes/resets there must increment `sessionVersion`. V2-04 now covers persistent enablement, disablement/session-version enforcement for local and OIDC identities, and migration preservation, and is checked based on the prior populated PostgreSQL rehearsal, local revocation tests, and recorded real-Keycloak-token verification. Final local API build and full suite passed (54 passed, 2 skipped because disposable PostgreSQL/Keycloak URLs are not configured); root build, web typecheck/build, Prisma validation and `git diff --check` passed. The default Chromium launcher could not start four interactive tests (`spawn UNKNOWN`), while one static test passed; rerunning the frontend suite using the installed Edge channel passed 5/5. The earlier Edge Playwright run (13/13) and deployed 390px workflow remain the broader UI evidence. Vite reports a 581.47 kB chunk-size warning.

Implementation evidence (2026-11-12, account, audit and history API): Completed V2-11–V2-13 with user detail editing/enablement, local password change/reset, and redacted transactional audit records; added matching Prisma migration and newest-first built-in Changelog entry. API build and full suite passed (79 passed, 2 skipped for optional Keycloak and disposable database configuration); Prisma validation passed; Edge Playwright frontend suite passed (7/7). A disposable local PostgreSQL 16 rehearsal deployed the migration and verified user detail, account update/disable revocation, persisted owner password change and admin reset, audit records for account/password/Base/authentication mutations, redaction, and actor deletion retaining the audit row with `actorId` set null. Completed V2-18’s owner-scoped history query API with combined search/filter/sort/pagination and validation; its focused and full API regressions passed. The PostgreSQL test is reproducible with `V2_TEST_DATABASE_URL`; real Keycloak and deployed-stack verification are not needed by these four tasks and remain future integration scope. Vite retains the existing ~591 kB chunk-size warning.

Implementation evidence (2026-11-12, authentication modes): Completed V2-14 with a persisted LOCAL/OIDC/HYBRID mode, backward-compatible enabled-to-HYBRID migration, validated provider configuration and safe issuer URLs, administrator-only audited updates, and database lockout-recovery guidance. API build, Prisma validation and full API suite passed (88 passed, 2 skipped); web typecheck/build passed (Vite reports a 591.60 kB chunk warning). A PostgreSQL 16 rehearsal deployed the migration over a legacy enabled OIDC row and verified HYBRID preservation, persisted settings on a fresh service instance, and the audit record. Mode/config/API tests passed; the optional live Keycloak-token test remains skipped because no disposable provider URL/credentials are configured.

**Checkpoint A:** Schema validates, authentication regression checks pass, and existing users can still sign in.

## Navigation and settings structure

- [x] **V2-05 — Introduce browser routes and query state (M)**
  - Map current view destinations to real paths under the configured base path; support back/forward and query parsing.
  - Acceptance: Workspace is default; direct links and refresh work; unsupported routes show a useful destination; page parameters are bounded.
  - Verify: browser navigation/direct-refresh checks including deployed subpath fallback.
  - Dependencies: 02–03. Files: `ModernApp.tsx`, app-shell navigation/header, routing and deployment configuration.

- [x] **V2-06 — Build the System Settings page shell (M)**
  - Add grouped left icon navigation for Users, Bases, Authentication, with page actions and responsive mobile navigation.
  - Acceptance: administrator-only settings entry; normal users receive API denial as well as hidden controls; active section has its own URL.
  - Verify: keyboard/mobile review and role access checks.
  - Dependencies: 01, 05. Files: new settings feature components, app shell, administrator guard.

## Base management

- [x] **V2-07 — Deliver Base list and creation (M)**
  - Add Base model, seed approved codes, and expose administrator list/create UI and API.
  - Acceptance: unique code, validated name, searchable/sortable paginated list; repeated seed deployment creates no duplicates.
  - Verify: schema/migration validation, duplicate/code validation and unauthorized-access checks.
  - Dependencies: 03, 06. Files: Prisma schema/migration, Base module/API client/settings page.

- [x] **V2-08 — Deliver Base edit/delete and user relation (M)**
  - Add User.baseId FK and indexed lookup; implement Base editing and guarded deletion.
  - Acceptance: existing users migrate safely; assigned bases cannot be deleted; reassignment is explicit; invalid FK values rejected.
  - Verify: FK/deletion tests, populated migration rehearsal, edit/delete UI states.
  - Dependencies: 04, 07. Files: Prisma schema/migration, Base service/controller/UI, user DTOs.

**Checkpoint B:** Settings routes work, seeded bases exist once, and referenced bases cannot be deleted accidentally.

## User management

- [x] **V2-09 — Deliver administrator registration (M)**
  - Add user registration route/form and transactional creation of User/local identity using GID, username, email, Base and password rules.
  - Acceptance: duplicate GID/username/email handled safely; required fields validated; password hashed; public requests cannot create accounts or set privileges.
  - Verify: registration/rollback/authorization checks; accessible form states.
  - Dependencies: 03–04, 06, 08. Files: user management module, DTOs, admin API client and registration page.

- [x] **V2-10 — Deliver searchable sortable user list (M)**
  - Show GID, Username, Email address, Base, Enabled and actions; implement server search plus Base/enabled filters, ascending/descending headers and pagination.
  - Acceptance: search includes approved user metadata and Base; query state appears in URL; sort fields allowlisted with stable tie-breaker.
  - Verify: combined search/filter/order/page requests, isolation/access checks, empty/loading states.
  - Dependencies: 05, 09. Files: admin user list service/DTO/client/page.

- [x] **V2-11 — Deliver user detail editing and enable toggle (M)**
  - Add user view/edit form with GID rules, username, email, Base, and enabled status.
  - Acceptance: changes persist; disabling revokes access; last usable administrator protected; rejected toggles roll back in UI.
  - Verify: validation/uniqueness/role checks and active-session disable flow.
  - Dependencies: 04, 10. Files: user detail API/DTO/UI, session enforcement.

- [x] **V2-12 — Deliver local password management (M)**
  - Add separate administrator reset and owner password-change flows with approved password policy and identity-aware UI.
  - Acceptance: owner change verifies current password; admins cannot retrieve passwords; OIDC-only credentials route to provider management; password changes and resets revoke local sessions by incrementing `sessionVersion`.
  - Verify: weak/oversized/password-reuse-policy cases as applicable, incorrect-current-password, authorization, redacted logs.
  - Dependencies: 03–04, 11. Files: password/auth service/DTOs, user detail/profile account components.

- [x] **V2-13 — Add management audit records (M)**
  - Record actor, action, target and redacted changes for user/Base/authentication mutations.
  - Acceptance: audit survives actor removal; mutation/audit consistency defined; passwords/tokens/secrets excluded.
  - Verify: audit entries for successful operations, no sensitive payloads, FK/index migration checks.
  - Dependencies: 08, 11–12. Files: Prisma schema/migration, shared audit service and management services.

**Checkpoint C:** Administrator can register, find, edit, disable and reset an account; ordinary users cannot invoke these actions.

## Authentication settings and sessions

- [x] **V2-14 — Persist local/OIDC/hybrid modes (M)**
  - Extend existing OidcSettings model and APIs with one coherent authentication mode and validated Keycloak parameters.
  - Acceptance: settings survive restarts; malformed/unsafe issuer URLs rejected; existing access preserved on migration; lockout recovery documented.
  - Verify: mode/config combinations, admin authorization and audit records.
  - Dependencies: 03–04, 06, 13. Files: existing authentication settings DTO/service/controller, Prisma migration.

- [x] **V2-15 — Build authentication settings and conditional Login (M)**
  - Add full-page settings controls for provider URL, realm, client ID, issuer and required group; apply the selected mode to Login.
  - Acceptance: LOCAL hides OIDC; OIDC displays provider-only login; HYBRID displays both; invalid config cannot be activated; disabled users remain blocked.
  - Verify: browser mode switching, Keycloak exchange/callback and configuration failure states.
  - Dependencies: 14. Files: authentication settings page, LoginScreen, ModernApp OIDC initialization.

Implementation evidence (2026-11-12): Edge Playwright authentication-settings suite passed (30/30), covering mode switching, unsafe/incomplete config rejection, load/retry failures, responsive/keyboard/localized settings, PKCE callback success/failure, exchange failures, and disabled-account behavior. A disposable local Keycloak 26.2.5 integration passed (1/1), verifying provider token validation, app-session exchange and disabled-user rejection. V2-14's PostgreSQL rehearsal verified persisted mode settings; the synchronized UI history is in migration `20261112123000_v2_authentication_ui` and `initialHistory`. Deployment-level verification remains blocked: the currently running API's `/excel-convert/auth/oidc/config` returned HTTP 500, and its database has only `20261110131804_initial_platform` applied, not the V2 migrations. No deployment database was modified.

- [x] **V2-16 — Handle session expiry globally (M)**
  - Centralize typed 401/session-expiry handling for requests, polling, previews/downloads and other authenticated transports.
  - Acceptance: clear credentials and logout once; no invalid-session errors rendered inside page content; 403 stays permission denial; no redirect loop.
  - Verify: expired/revoked sessions during list load, polling, save, preview and download; both auth providers.
  - Dependencies: 04–05, 15. Files: API client/tracked fetch, session owner in ModernApp, preview/download callers.

Implementation evidence (2026-11-12): Added a typed 401 error and shared authenticated-fetch event handler; local and Keycloak-exchanged app sessions now clear credentials once, stop polling, show a Login expiry message, preserve only an allowlisted internal route, and leave 403 errors as permission denials. Edge Playwright task suite passed independently (7/7); the implementer also ran the combined session/authentication/frontend suite (44/44), web TypeScript check, production build and `git diff --check` successfully. The new fallback/migration history entry is synchronized in migration `20261112124500_v2_session_expiry` and `initialHistory`. No live deployment was changed or certified; the active API database remains on the initial migration only.

## Personal experience and history

- [x] **V2-17 — Consolidate personal home into Profile (M)**
  - Remove the standalone Profile heading/subtitle; keep professional identity banner, read-only tabs and explicit Edit info. Add New translation.
  - Acceptance: New translation opens Workspace; personal statistics remain owner-scoped; Dashboard nav/component is retired and old URLs redirect to Profile; login/root still land on Workspace.
  - Verify: navigation, profile edits, dashboard data ownership, mobile and three-language review.
  - Dependencies: 05, 12, 16. Files: ProfilePage, DashboardPage consumers, ModernApp, app shell and CSS/locales.

Implementation evidence (2026-11-12): Edge Playwright V2-17 cases passed (3/3), and 11/11 related Profile, legacy-route, root/login and session-expiry browser cases passed after review added a semantic h1 for the user's identity. The focused API suite passed 7/7, including database job-list owner scoping. Tests cover legacy `/dashboard` redirection with query preservation, direct refresh/back/forward, Workspace as root/login destination, read-only details/edit flow, New translation, and English/Japanese/Chinese at a 390px viewport. Web TypeScript check, production build and `git diff --check` passed; Vite retains its >500 kB chunk advisory. The Changelog entry is synchronized in migration `20261112130500_v2_profile_home` and newest-first `initialHistory`. No deployed database or browser environment was modified or certified.

- [x] **V2-18 — Add history query API (M)**
  - Extend owner-scoped history with filename/metadata search, source/target language filters, supported column sorting and bounded page sizes 10–50.
  - Acceptance: count matches filters; deterministic ordering; unsupported sort/filter/limit rejected; no cross-user results.
  - Verify: combined filter/sort/pagination cases and injection/ownership checks.
  - Dependencies: 03, 05. Files: product-surfaces service/controller/DTO, API types/history client.

- [x] **V2-19 — Add history search and table controls (M)**
  - Wire searchable/sortable table, language selectors and 10/20/30/40/50 page-size menu to URL query state.
  - Acceptance: default 10; changing filters/page size resets page; back/forward restores controls; stale responses cannot replace current results; previews/downloads still work.
  - Verify: browser combined controls, final/empty pages, keyboard/mobile/localization and session expiry.
  - Dependencies: 16, 18. Files: HistoryPage, API client/types, locale strings.

Implementation evidence (2026-11-12): Independent focused Edge Playwright checks passed (3/3), covering combined URL-backed search/filter/sort/page size, page reset, browser back/forward, superseded response protection, final/empty result states, keyboard sorting, preview/download, and English/Japanese/Chinese mobile layouts. Web TypeScript check and production build passed; Vite reports its existing >500 kB chunk advisory. Related session-expiry browser coverage passed earlier (7/7 focused); `git diff --check` passed. Changelog migration `20261112131800_v2_history_controls` and `initialHistory` entry are synchronized and newest-first. Deployment-level verification remains unavailable; no deployment database was changed.

- [x] **V2-20 — Validate search indexes using actual queries (M)**
  - Analyze user/Base/history searches and add justified FK/composite/trigram indexes in new migrations.
  - Acceptance: representative EXPLAIN plans documented; pg_trgm support checked if used; no redundant indexes added blindly.
  - Verify: representative seeded data, query plans, migration deployment and result correctness.
  - Dependencies: 10, 18–19. Files: Prisma schema/migration and performance notes.

Implementation evidence (2026-11-12): PostgreSQL 16.15 with `pg_trgm` 1.6 available; populated local benchmark (50,002 users, 100,001 jobs, 5 Bases) showed the original user-search `OR` plan did not use trigram indexes (77.5 ms count / 66.8 ms ordered page). Splitting Base matching from user text search enabled GIN `BitmapOr` plans (0.46 ms count / 0.12 ms page); Base search remained a negligible 5-row scan. Filename history search used GIN (~0.12 ms); owner+language and default history used their composite indexes (index-only scans, ~0.04/~0.06 ms). Prior pre-migration filename scan was ~44 ms. Plans and limitations are documented in `project/docs/v2-search-index-validation.md`. Fresh disposable PostgreSQL migration/API integration and Changelog fallback parity passed (2/2), including index/extension deployment, Changelog synchronization, user search results, and owner-scoped history results. API suite passed 90/90 (2 optional Keycloak/disposable DB tests skipped); Prisma validation and full API/web production build passed. Vite retains its >500 kB chunk advisory. No deployed PostgreSQL/extension availability, production lock window, or production query-plan evidence; not production-certified.

**Checkpoint D:** Mode-dependent login, automatic logout, profile navigation and shareable history queries work together.

## Branding, footer and release

- [ ] **V2-21 — Create original SVG identity assets (S)**
  - Design a system-specific SVG mark for the favicon and top header; wire favicon references and accessible branding.
  - Acceptance: same identity at small and header sizes, legible in light/dark themes; original vector artwork committed.
  - Verify: favicon loads on nested routes and review at small sizes in both themes.
  - Dependencies: 05. Files: web public/assets SVG, index.html, AppHeader.

- [ ] **V2-22 — Add backend-year footer (M)**
  - Expose safe system display metadata and render `Translation System Taiyo Yuden Co. Ltd © {year}` below page content.
  - Acceptance: year supplied by backend under agreed timezone policy; year rollover/cache behavior defined; footer works on short and long pages without covering controls.
  - Verify: backend year-boundary checks, unavailable API behavior, mobile layout.
  - Dependencies: 05. Files: system info endpoint/client, app shell footer/locales/CSS.

- [ ] **V2-23 — Complete integration and deployment review (M)**
  - Rehearse forward migrations on existing data; verify admin restrictions, password policy, OIDC modes, disabled sessions, URL refreshes and retained workbook flows.
  - Acceptance: focused regressions and API/frontend builds pass; frontend typecheck passes; English/Japanese/Chinese and 320/768/1024/1440 layouts reviewed; operational recovery and deployment notes updated.
  - Verify: `npm run build`, `npx tsc --noEmit` in web, API `npm run prisma:validate`, existing focused authentication/API checks and relevant Playwright suites; add meaningful new coverage with the implementation tasks.
  - Dependencies: 13, 15–22. Files: relevant tests, deployment docs, V2 trackers, Changelog migration/fallback.

## Completion rules for every task

- Record concrete verification evidence and remaining limitations before checking a task complete.
- Add one readable Changelog entry per completed related update in a new Prisma migration and `initialHistory`; keep values synchronized and newest first.
- Preserve prior published history and existing user work. Never weaken validation, ownership checks or tests to make a task appear complete.
- This roadmap is not release approval and does not mark any listed feature as delivered.
