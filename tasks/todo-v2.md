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

- [ ] **V2-03 — Centralize DTO and input validation (M)**
  - Configure server validation and reusable body/query/path constraints; mirror field limits in UI helpers.
  - Acceptance: malformed IDs, unknown fields, oversized input, invalid emails, and invalid sort/page parameters are rejected; valid CJK names remain usable.
  - Verify: focused API validation checks and builds; no password normalization or secret logging.
  - Dependencies: 01–02. Files: API bootstrap/DTO modules, frontend validation helpers.

- [ ] **V2-04 — Add persistent account enablement and revocation (M)**
  - Extend User with enabled/session-version state and preserve existing accounts; enforce state across local and OIDC protected requests.
  - Acceptance: disabled users cannot obtain or continue sessions; password reset revokes local sessions; existing UUID/identity links survive migration.
  - Verify: migration on populated data and focused authentication/guard tests for both providers.
  - Dependencies: 01–03. Files: Prisma schema/migration, authentication service/guards.

Baseline evidence (2026-11-12): frontend `npx tsc --noEmit` and web/API builds pass after the SimpleGrid fix. The notification test mock was updated for the current ten-item pagination and total count; `node --test test/notifications.test.cjs` passes (4/4). Vite reports a chunk-size warning. Runtime browser verification remains outstanding.

**Checkpoint A:** Schema validates, authentication regression checks pass, and existing users can still sign in.

## Navigation and settings structure

- [ ] **V2-05 — Introduce browser routes and query state (M)**
  - Map current view destinations to real paths under the configured base path; support back/forward and query parsing.
  - Acceptance: Workspace is default; direct links and refresh work; unsupported routes show a useful destination; page parameters are bounded.
  - Verify: browser navigation/direct-refresh checks including deployed subpath fallback.
  - Dependencies: 02–03. Files: `ModernApp.tsx`, app-shell navigation/header, routing and deployment configuration.

- [ ] **V2-06 — Build the System Settings page shell (M)**
  - Add grouped left icon navigation for Users, Bases, Authentication, with page actions and responsive mobile navigation.
  - Acceptance: administrator-only settings entry; normal users receive API denial as well as hidden controls; active section has its own URL.
  - Verify: keyboard/mobile review and role access checks.
  - Dependencies: 01, 05. Files: new settings feature components, app shell, administrator guard.

## Base management

- [ ] **V2-07 — Deliver Base list and creation (M)**
  - Add Base model, seed approved codes, and expose administrator list/create UI and API.
  - Acceptance: unique code, validated name, searchable/sortable paginated list; repeated seed deployment creates no duplicates.
  - Verify: schema/migration validation, duplicate/code validation and unauthorized-access checks.
  - Dependencies: 03, 06. Files: Prisma schema/migration, Base module/API client/settings page.

- [ ] **V2-08 — Deliver Base edit/delete and user relation (M)**
  - Add User.baseId FK and indexed lookup; implement Base editing and guarded deletion.
  - Acceptance: existing users migrate safely; assigned bases cannot be deleted; reassignment is explicit; invalid FK values rejected.
  - Verify: FK/deletion tests, populated migration rehearsal, edit/delete UI states.
  - Dependencies: 04, 07. Files: Prisma schema/migration, Base service/controller/UI, user DTOs.

**Checkpoint B:** Settings routes work, seeded bases exist once, and referenced bases cannot be deleted accidentally.

## User management

- [ ] **V2-09 — Deliver administrator registration (M)**
  - Add user registration route/form and transactional creation of User/local identity using GID, username, email, Base and password rules.
  - Acceptance: duplicate GID/username/email handled safely; required fields validated; password hashed; public requests cannot create accounts or set privileges.
  - Verify: registration/rollback/authorization checks; accessible form states.
  - Dependencies: 03–04, 06, 08. Files: user management module, DTOs, admin API client and registration page.

- [ ] **V2-10 — Deliver searchable sortable user list (M)**
  - Show GID, Username, Email address, Base, Enabled and actions; implement server search plus Base/enabled filters, ascending/descending headers and pagination.
  - Acceptance: search includes approved user metadata and Base; query state appears in URL; sort fields allowlisted with stable tie-breaker.
  - Verify: combined search/filter/order/page requests, isolation/access checks, empty/loading states.
  - Dependencies: 05, 09. Files: admin user list service/DTO/client/page.

- [ ] **V2-11 — Deliver user detail editing and enable toggle (M)**
  - Add user view/edit form with GID rules, username, email, Base, and enabled status.
  - Acceptance: changes persist; disabling revokes access; last usable administrator protected; rejected toggles roll back in UI.
  - Verify: validation/uniqueness/role checks and active-session disable flow.
  - Dependencies: 04, 10. Files: user detail API/DTO/UI, session enforcement.

- [ ] **V2-12 — Deliver local password management (M)**
  - Add separate administrator reset and owner password-change flows with approved password policy and identity-aware UI.
  - Acceptance: owner change verifies current password; admins cannot retrieve passwords; OIDC-only credentials route to provider management; reset revokes local sessions.
  - Verify: weak/oversized/password-reuse-policy cases as applicable, incorrect-current-password, authorization, redacted logs.
  - Dependencies: 03–04, 11. Files: password/auth service/DTOs, user detail/profile account components.

- [ ] **V2-13 — Add management audit records (M)**
  - Record actor, action, target and redacted changes for user/Base/authentication mutations.
  - Acceptance: audit survives actor removal; mutation/audit consistency defined; passwords/tokens/secrets excluded.
  - Verify: audit entries for successful operations, no sensitive payloads, FK/index migration checks.
  - Dependencies: 08, 11–12. Files: Prisma schema/migration, shared audit service and management services.

**Checkpoint C:** Administrator can register, find, edit, disable and reset an account; ordinary users cannot invoke these actions.

## Authentication settings and sessions

- [ ] **V2-14 — Persist local/OIDC/hybrid modes (M)**
  - Extend existing OidcSettings model and APIs with one coherent authentication mode and validated Keycloak parameters.
  - Acceptance: settings survive restarts; malformed/unsafe issuer URLs rejected; existing access preserved on migration; lockout recovery documented.
  - Verify: mode/config combinations, admin authorization and audit records.
  - Dependencies: 03–04, 06, 13. Files: existing authentication settings DTO/service/controller, Prisma migration.

- [ ] **V2-15 — Build authentication settings and conditional Login (M)**
  - Add full-page settings controls for provider URL, realm, client ID, issuer and required group; apply the selected mode to Login.
  - Acceptance: LOCAL hides OIDC; OIDC displays provider-only login; HYBRID displays both; invalid config cannot be activated; disabled users remain blocked.
  - Verify: browser mode switching, Keycloak exchange/callback and configuration failure states.
  - Dependencies: 14. Files: authentication settings page, LoginScreen, ModernApp OIDC initialization.

- [ ] **V2-16 — Handle session expiry globally (M)**
  - Centralize typed 401/session-expiry handling for requests, polling, previews/downloads and other authenticated transports.
  - Acceptance: clear credentials and logout once; no invalid-session errors rendered inside page content; 403 stays permission denial; no redirect loop.
  - Verify: expired/revoked sessions during list load, polling, save, preview and download; both auth providers.
  - Dependencies: 04–05, 15. Files: API client/tracked fetch, session owner in ModernApp, preview/download callers.

## Personal experience and history

- [ ] **V2-17 — Consolidate personal home into Profile (M)**
  - Remove the standalone Profile heading/subtitle; keep professional identity banner, read-only tabs and explicit Edit info. Add New translation.
  - Acceptance: New translation opens Workspace; personal statistics remain owner-scoped; Dashboard nav/component is retired and old URLs redirect to Profile; login/root still land on Workspace.
  - Verify: navigation, profile edits, dashboard data ownership, mobile and three-language review.
  - Dependencies: 05, 12, 16. Files: ProfilePage, DashboardPage consumers, ModernApp, app shell and CSS/locales.

- [ ] **V2-18 — Add history query API (M)**
  - Extend owner-scoped history with filename/metadata search, source/target language filters, supported column sorting and bounded page sizes 10–50.
  - Acceptance: count matches filters; deterministic ordering; unsupported sort/filter/limit rejected; no cross-user results.
  - Verify: combined filter/sort/pagination cases and injection/ownership checks.
  - Dependencies: 03, 05. Files: product-surfaces service/controller/DTO, API types/history client.

- [ ] **V2-19 — Add history search and table controls (M)**
  - Wire searchable/sortable table, language selectors and 10/20/30/40/50 page-size menu to URL query state.
  - Acceptance: default 10; changing filters/page size resets page; back/forward restores controls; stale responses cannot replace current results; previews/downloads still work.
  - Verify: browser combined controls, final/empty pages, keyboard/mobile/localization and session expiry.
  - Dependencies: 16, 18. Files: HistoryPage, API client/types, locale strings.

- [ ] **V2-20 — Validate search indexes using actual queries (M)**
  - Analyze user/Base/history searches and add justified FK/composite/trigram indexes in new migrations.
  - Acceptance: representative EXPLAIN plans documented; pg_trgm support checked if used; no redundant indexes added blindly.
  - Verify: representative seeded data, query plans, migration deployment and result correctness.
  - Dependencies: 10, 18–19. Files: Prisma schema/migration and performance notes.

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
