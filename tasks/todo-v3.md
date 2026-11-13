# Excel Translator Todo — Version 3

Created: 2026-11-13. Status: V3-01–V3-14 completed and verified.
Plan: [plan-v3.md](plan-v3.md).
Previous version: [todo-v2.md](todo-v2.md).

This checklist records the requested changes; it does not claim they are implemented. Keep existing authentication, ownership, localization, and responsive behavior intact.

## Implementation decisions

- **Translation concurrency:** Configure one to five workers, defaulting to five. Starts and retries are rejected with HTTP 409 at capacity; one API instance per database is enforced and interrupted jobs are retryable.
- **Profile avatar:** Use initials or a default avatar; image upload and storage are outside this update.

## Vocabulary

- [x] **V3-01 — Make vocabulary groups searchable (M)**
  - Replace the group selection presentation with a dropdown offering searchable autocomplete.
  - Acceptance: users can search and select existing groups, and the selected group's terms and actions remain available; empty, loading, and no-match states are clear.
  - Verify: focused browser checks for selection, search, keyboard navigation, and empty groups.
  - Dependencies: none. Files: `project/apps/web/src/features/vocabulary/VocabularyPage.tsx`, relevant UI tests.
  - Evidence: browser checks cover keyboard search and selection, empty/loading/no-match states, group creation and deletion, responsive layout, and Japanese and Chinese labels.

- [x] **V3-02 — Align and simplify vocabulary actions (S)**
  - Put Add term on the same level as Edit Group; show a pencil icon after the group name for editing, and use icon-only Add term and Delete actions.
  - Acceptance: actions retain existing edit, add, and delete behavior and confirmation; icon-only controls have localized accessible names and keyboard focus.
  - Verify: browser checks for group/term actions, confirmation, keyboard access, and narrow layouts.
  - Dependencies: V3-01. Files: vocabulary page and relevant UI tests.
  - Evidence: browser checks cover icon labels, keyboard editing, adding and delete confirmation, and long names on narrow screens.

**Checkpoint A:** Group search and vocabulary actions work with keyboard and touch, without changing saved data.

## Translation history

- [x] **V3-03 — Align history pagination controls (S)**
  - Place the Rows per page dropdown alongside the pagination controls below the history list.
  - Acceptance: changing page size and page still updates the existing URL/query state; controls remain usable on narrow screens.
  - Verify: browser checks for pagination, page-size changes, URL restoration, and responsive layout.
  - Dependencies: none. Files: `project/apps/web/src/features/history/HistoryPage.tsx`, relevant UI tests.
  - Evidence: browser checks cover placement, page size and URL restoration, an empty result, and a 320px layout.

- [x] **V3-04 — Refresh history automatically (M)**
  - Remove the Refresh button and automatically update history when jobs are added or their status or completion changes, using the agreed refresh strategy.
  - Acceptance: new data appears within the agreed delay without losing search, filters, sort, or pagination; failures are visible and refresh stops on unmount or session expiry.
  - Verify: browser/API checks for newly added, progressing, and completed jobs, failed requests, and cleanup.
  - Dependencies: history refresh decision. Files: history page, existing API/refresh helpers, relevant tests.
  - Evidence: browser checks cover processing-to-completed changes, new jobs, visible errors and retry, preserved URL state, unmount cleanup, and session expiry.

- [x] **V3-05 — Open history previews from filenames (S)**
  - Make each filename open the same view as its existing View action, with an underline on hover.
  - Acceptance: preview availability and permissions match the View action; links are keyboard accessible and distinguishable on focus.
  - Verify: compare filename and View behavior for available and unavailable previews, including keyboard navigation.
  - Dependencies: none. Files: history page and relevant UI tests.
  - Evidence: browser checks cover hover, keyboard activation, and matching original-preview behavior for a processing job.

- [x] **V3-06 — Correct history scrolling (S)**
  - Remove sticky behavior from the search card and confine the translation list's scrolling to its table or card as agreed.
  - Acceptance: search controls do not stick during scrolling; table content and pagination remain reachable on desktop and mobile.
  - Verify: browser scrolling checks at desktop and mobile viewport sizes.
  - Dependencies: history scrolling decision; coordinate with V3-03. Files: history page and relevant styles/tests.
  - Evidence: browser checks cover keyboard scrolling, search and pagination placement, and horizontal scrolling at 320px.

**Checkpoint B:** History updates automatically, filenames open previews, and filters and pagination remain usable while scrolling.

## Application shell

- [x] **V3-07 — Move profile controls to the lower left (M)**
  - Replace the upper profile control with a GitHub-like lower-left profile area showing an avatar, name, and email, including a sun/moon light-dark toggle.
  - Acceptance: new and existing accounts have an appropriate avatar as agreed; profile navigation, sign-out, theme persistence, loading, and missing-name/email states remain usable on desktop and mobile.
  - Verify: browser checks for both themes, new and existing accounts, keyboard access, and responsive navigation.
  - Dependencies: profile avatar decision. Files: app-shell components, profile data integration, relevant styles/tests.
  - Evidence: browser checks cover profile details, missing and failed loads, avatar initials, menu actions, theme persistence, keyboard access, and narrow layouts.

- [x] **V3-08 — Add a bottom-right language selector (M)**
  - Place a globe icon at the bottom right that opens upward to select English, Japanese, or Chinese.
  - Acceptance: selecting a language updates and persists the existing locale; the selector supports keyboard use and does not obstruct content on mobile.
  - Verify: browser checks for all three languages, saved preference, popup positioning, and keyboard dismissal.
  - Dependencies: coordinate placement with V3-07. Files: app shell, existing locale provider, relevant styles/tests.
  - Evidence: browser checks cover all three locales, persistence, upward popup placement, keyboard dismissal, and responsive widths.

## Workbook presentation

- [x] **V3-09 — Use an Excel SVG file icon (S)**
  - Replace workbook/file Lucide icons with an appropriate Excel-style SVG wherever the application presents Excel files.
  - Acceptance: the SVG remains clear at the displayed sizes and in both themes; decorative images do not duplicate accessible filenames. Use an appropriately licensed or original asset.
  - Verify: inspect workbook icons across Workspace and History at desktop/mobile sizes and in both themes.
  - Dependencies: none. Files: workbook icon asset/components, relevant UI tests.
  - Evidence: browser checks cover Workspace, History, and Profile, including mobile, dark mode, and decorative accessibility.

- [x] **V3-10 — Align recent translation columns (S)**
  - Give filename, status, and View/Download actions separate, aligned columns in Workspace recent translations.
  - Acceptance: rows remain readable with long filenames and narrow screens; existing preview/download availability is unchanged.
  - Verify: browser checks with multiple statuses, long filenames, and responsive layouts.
  - Dependencies: coordinate shared workbook icon work with V3-09. Files: `project/apps/web/src/features/workspace/JobList.tsx`, relevant styles/tests.
  - Evidence: browser checks cover aligned columns for completed, failed, and cancelled jobs, long filenames, action availability, and a 320px layout.

**Checkpoint C:** Profile and language controls remain accessible, localized, and responsive; workbook actions are unchanged.

## Translation concurrency

- [x] **V3-11 — Enforce configurable translation concurrency (M)**
  - Add an environment setting for the agreed concurrent-translation limit, with five as the requested baseline; enforce it where jobs are started and retried.
  - Acceptance: the configured limit is validated and never exceeded under simultaneous requests; reaching the limit follows the agreed queue/rejection policy and preserves job ownership and lifecycle.
  - Verify: focused concurrency tests at one and five, invalid configuration, simultaneous starts/retries, cancellation, failure, and multiple instances if supported.
  - Dependencies: translation concurrency decision. Files: job management service/configuration, environment examples, API tests.
  - Evidence: focused tests cover limits one and five, invalid configuration, simultaneous starts/retries, cancellation, failure, and shutdown; PostgreSQL checks cover atomic admission and single-instance exclusion.

- [x] **V3-12 — Verify concurrency recovery and operations (M)**
  - Document the setting and verify restart/recovery behavior for running and waiting jobs under the selected policy.
  - Acceptance: a restart or failure cannot strand jobs or permanently consume capacity; operational guidance explains changing the limit and any deployment constraints.
  - Verify: integration tests against a disposable database for completion, cancellation, failure, and restart/recovery; validate deployment configuration.
  - Dependencies: V3-11. Files: job lifecycle tests and deployment documentation.
  - Evidence: disposable PostgreSQL tests cover recovery and slot release; deterministic tests cover cancellation and shutdown interleavings. Deployment guidance documents the enforced single-instance policy.

**Checkpoint D:** The configured limit is demonstrably enforced and job recovery remains reliable.

## Translation startup fix

- [x] **V3-14 — Restore translation settings and start (M)**
  - Fix the reported `Unexpected field.` response when saving translation settings or starting a job.
  - Acceptance: Save settings, Save and start, and Start work with valid worksheet and language selections; invalid requests remain rejected.
  - Verify: reproduce the reported failure, add focused regression coverage, and verify the start workflow.
  - Dependencies: none. Files: translation settings and job-start client/API paths and relevant tests.
  - Evidence: browser regressions reproduced the rejected extra fields and passed for all three actions after the fix; API boundary checks accept the complete settings payload and still reject unknown fields.

## Final verification

- [x] **V3-13 — Run integrated V3 checks (M)**
  - Verify the completed vocabulary, history, shell, workbook, and concurrent-job workflows together.
  - Acceptance: all V3 criteria are met, existing permissions and data are preserved, and synchronized Changelog entries describe completed updates.
  - Verify: relevant API tests and build, web typecheck/build, and desktop/mobile browser checks including localization, accessibility, and session expiry.
  - Dependencies: V3-01–V3-12 and V3-14. Files: existing API and browser test suites.
  - Evidence: 35 integrated browser checks and 24 shell/regression checks passed; API suite passed 115 tests with 3 external-service tests skipped; builds and typechecks passed. Disposable PostgreSQL verified migrations, admission, recovery, and slot release. An isolated HTTP workflow verified settings, start, completion, and workbook download using a deterministic local translation stub. Real model quality and screen-reader testing were not assessed.
