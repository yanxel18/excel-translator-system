# Version 3 implementation plan

Created: 2026-11-13 (Asia/Tokyo)
Status: Planned; no V3 feature in this document is claimed as implemented.
Task tracker: [todo-v3.md](todo-v3.md). The previous plan remains in [plan-v2.md](plan-v2.md).

## Objectives and scope

Improve vocabulary group selection and actions, translation history, profile and language controls, workbook presentation, and control of concurrent translations. Restore saving translation settings and starting jobs (V3-14). Preserve existing authentication, owner-scoped data, session handling, localization, and responsive layouts. The V3 checklist contains the implementation slices, acceptance criteria, dependencies, and verification steps; it remains the source of task status.

## Current foundation

- Vocabulary groups and terms already have authenticated CRUD and a page with group and entry editing and deletion.
- History already supports server-side search, language filters, sorting, numbered pages, preview, and download. Its query is represented in the URL; requests are aborted when the query changes.
- The app shell has header profile and theme controls, a navigation rail, persisted locale selection, and a backend-year footer. Workspace already polls while a job is processing.
- The database job service claims pending or failed jobs before starting work. On startup, it currently marks all processing jobs as interrupted and retryable; this behavior must be assessed before supporting multiple API instances.

## Decisions required before affected work

1. **Concurrency (V3-11–V3-12):** Is five the default that operators may raise, or the maximum with a configurable value from one to five? When full, should a start/retry be queued or rejected? Is the limit per API instance or global across instances? Agree on restart, cancellation, and recovery behavior.
2. **Profile avatar (V3-07):** Confirm whether initials/default artwork meets the request or whether user-provided image upload and persistent storage are required. Uploads would need a separate design for validation, authorization, privacy, and migration.

These are open decisions, not implemented behavior. Other independent tasks can proceed without resolving them.

## Interface and behavior

### Vocabulary — V3-01–V3-02

Use a searchable group dropdown with an explicit selected group and clear loading, empty, and no-match states. Place Add term at the same level as group editing; use a pencil after the group name and icon-only Add term/Delete actions. Preserve group/term CRUD, deletion confirmation, validation, language compatibility, and ownership. Icon-only controls require localized accessible names, visible focus, and keyboard support.

### Translation history — V3-03–V3-06

Move Rows per page beside the lower pagination controls. Automatically poll the owner-scoped history API 1.2 seconds after each completed request; network latency can add to this delay. Preserve URL search, filters, sort, page, and page size while refreshing; cancel or ignore stale requests, stop refresh after unmount or session expiry, and display failures without pretending data is current.

Make filenames activate the same preview behavior and availability as View, with hover underline and a visible keyboard focus state. Keep search outside the independently scrollable table and allow the page itself to scroll, without hiding pagination or making mobile content inaccessible.

### Application shell — V3-07–V3-08

Move the profile entry from the upper area to the lower left. Show an agreed avatar, name, and email, with safe fallbacks for missing profile data, and provide the sun/moon theme toggle. Retain profile navigation and sign-out, existing theme persistence, mobile navigation, and administrator controls.

Add a bottom-right globe control whose popup opens upward and offers English, Japanese, and Chinese using the existing locale provider and saved preference. Ensure popup placement, focus, dismissal, and content visibility work on narrow screens.

### Workbook presentation — V3-09–V3-10

Replace workbook/file Lucide icons with an original or appropriately licensed Excel-style SVG, retaining accessible filenames and light/dark legibility. In Workspace recent translations, align filename, status, and View/Download actions into separate columns; preserve action availability and handle long names and narrow screens.

## Concurrency and recovery design

Treat the configured limit as a server-enforced invariant, not a UI-only restriction. Validate the environment value at startup, document its accepted range and default after the concurrency decision, and apply the same policy to start and retry requests. Limit accounting must be atomic with job claims so simultaneous requests cannot exceed the agreed scope.

If a queue is selected, define a durable distinction between jobs awaiting user setup and jobs explicitly queued for execution, plus ordering, cancellation, and restart semantics. If rejection is selected, return a clear actionable response while leaving the job retryable. Neither policy may lose or duplicate work.

A process-local counter cannot guarantee a cross-instance limit. If multiple instances are in scope, use a database-coordinated claim/lease design and update the current startup recovery behavior so one instance cannot mark another instance's active jobs failed. If the agreed scope is single-instance only, document and enforce the deployment constraint rather than implying cluster-wide protection.

Test capacity release on success, failure, cancellation, and interruption; test simultaneous starts and retries, configured limits, and crash/restart behavior with a disposable database. Do not modify production migration history or reset application data.

## Delivery order and coordination

1. Resolve the relevant decisions above before the dependent slices.
2. Deliver vocabulary (V3-01–02), history (V3-03–06), shell (V3-07–08), and workbook presentation (V3-09–10) as independently verifiable slices. Coordinate changes sharing History, shell, or Workspace files to avoid conflicting edits.
3. Implement concurrency enforcement and recovery (V3-11–12) after the policy and deployment scope are agreed. Keep deployment configuration and operator guidance aligned.
4. Run integrated checks (V3-13). Update task status only with evidence, and add synchronized database and built-in Changelog entries for each completed update.

## Verification and risks

- Run the existing focused API and browser tests for each changed flow; run API tests/build and web typecheck/build at integration.
- Verify desktop and mobile layouts, keyboard operation, accessible icon names, all three locales, both themes, and session-expiry behavior in a real browser.
- Exercise history refresh with concurrent query changes and failed responses so older responses cannot overwrite newer filters or expose another user's jobs.
- Exercise concurrency at the agreed boundaries under simultaneous requests and actual restart/recovery, including multiple instances if supported.
- Preserve existing user, job, and workbook data during any required migration; rehearse schema changes on a populated disposable database.
