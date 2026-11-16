# Version 6 tasks

Plan: [plan-v6.md](plan-v6.md). Check a task only after its verification passes.

## Identity and bases

- [x] Limit profile full-name edits to 50 Unicode code points, with localized
  validation and REST, GraphQL and browser boundary tests.
- [x] Let administrators create and edit users with a login username and a
  separate full name, while retaining compatibility with older account data.
- [x] Enforce the 50-Unicode-code-point full-name limit in PostgreSQL and reject
  overlong OIDC names for new and existing identities with actionable feedback.
  Verify preserved data/logins, overlong-row migration rejection, Unicode
  boundaries and reversal on disposable PostgreSQL.
- [ ] Define and test the username/GID, full-name, base-acronym and API contracts.
  Verify uniqueness, Unicode names and length boundaries
  ([contract](identity-contract-v6.md)).
- [ ] Migrate account and base storage safely, including dependent foreign keys;
  verify the migration using a disposable database and test existing identities.
- [x] Make `Base.code` the PostgreSQL primary key while retaining immutable unique
  UUID `Base.id` and compatible `User.baseId` assignments. Verify populated
  prior-schema upgrade/reversal, old/new Prisma clients, UUID HTTP APIs,
  local/OIDC identities, acronym edits, duplicate/delete restrictions and
  migration/concurrency failures on disposable PostgreSQL
  ([migration evidence](../project/docs/v6-base-primary-key-migration.md)).
  This narrower slice does not complete the broader account/storage tasks.
- [ ] Update user creation, editing, sign-in and profile flows to the new
  contracts. Verify both local and existing OIDC behavior.
- [x] Simplify base creation, editing and assignment to one acronym field.
  Verify duplicates, edits, assigned users and deletion restrictions. Preserve
  legacy names and UUID-based API compatibility.
- [x] Provide a versioned acronym-only base API with administrator authorization,
  duplicate and deletion protection, atomic acronym edits, and compatibility tests.
- [x] Add versioned account creation, lookup and partial editing using a base
  acronym, preserving UUID assignments and login identities. Verify Unicode
  names, authorization, duplicate rejection and local sign-in on PostgreSQL.
  The broader account contract remains pending.
- [x] Connect account creation, editing, access toggles and base assignment to
  the acronym-based API. Verify exact request fields, legacy and OIDC accounts,
  Unicode boundaries, saved selections, password controls and responsive UI.

## Navigation

- [x] Rename the Workspace sidebar action to Translate File in supported locales.
  Verify the destination and current-page state remain unchanged.
- [x] Move System Settings and Changelog to the sidebar; verify admin and
  non-admin access, keyboard navigation and mobile layouts.

## Maintenance notices

- [x] Define maintenance scheduling, permissions, time zones and lifecycle;
  add a persisted schedule and administrator management API with tests.
- [x] Add settings controls and an accessible, localized in-content notice;
  verify scheduled, active, expired, disabled and invalid states.

## Upload limits

- [x] Trace upload, proxy, workbook processing and preview limits; document memory
  implications and determine the safe 200 MB handling strategy
  ([safety strategy](../project/docs/v6-upload-safety.md)).
- [x] Fix web nginx rejecting currently supported uploads above 1 MB. Verify
  complete 50 MiB multipart forwarding and bounded rejection with real nginx;
  retain application settings and the current 50 MiB file ceiling.
- [x] Draft the resumable-upload specification from the confirmed user goal:
  retain the browser file and automatically resume after refresh/restart for
  24 hours, with one active receive/validation and retryable busy feedback.
- [x] Approve the resumable-upload protocol, chunk size, temporary disk budget
  and retention/recovery semantics in [the specification](plan-v6.md).
- [x] Ground a small delivery plan in the existing upload/job paths, API client
  and authenticated app lifecycle; define dependencies and runtime checkpoints.
- [x] Review the delivery order, retry timing and persistent manual-pause
  behavior in [the delivery plan](plan-v6.md#resumable-upload-delivery-plan).
- [ ] Implement and verify retained-browser-file chunk uploads and automatic
  resume, including interrupted acknowledgments, exact limits, ownership,
  storage failures/expiry and crash-safe single-job finalization.
- [ ] Support configurable limits from 1 to 200 MB end to end and update
  translations and deployment documentation. Test real boundaries and rejection.

### Resumable delivery tasks

The delivery plan and task list are approved. Unchecked tasks and their new
test-file names remain planned targets, not commands claimed to have passed.
API tests use the existing `node --test` runner against built API code; browser tests use the
existing Playwright runner. Each task includes the contribution requirements
in the delivery plan.

#### 1. `upload-admission`: Bound active upload reception

Dependencies: None after plan approval.
Core files: new upload admission service/interceptor, upload controller/module,
and `project/apps/api/test/upload-admission.test.cjs`.

- [x] Acquire one shared upload slot after authentication but before Multer
  reads the body; return `UPLOAD_BUSY`/409 with `Retry-After` for excess work.
- [x] Release only after receive/validation/job creation settles; aborts,
  exceptions and shutdown cannot leak or prematurely release the slot.
- [x] Preserve existing 50 MiB uploads, configured limits and translation slots.
- Verify: API build; `node --test project\apps\api\test\upload-admission.test.cjs`;
  real concurrent/aborted HTTP receives, including unauthorized requests.
  Implemented with the existing API Multer 2.5 parser: Nest's built-in interceptor
  resolves older nested Multer 2.0.2, which did not settle an aborted receive.
  Six admission/abort/error/shutdown/boundary tests pass, including exact 50 MiB
  and one-extra-byte cases. The overlap test fails with admission disabled.
  Final admission/settings/workbook regression run: 23 tests passed; API compile
  and web type-check passed. Local Compose rebuild succeeded, services are
  running, the application returned HTTP 200 and unauthorized upload HTTP 401.
  All 91 migrations applied; the new live/built-in history entries match.
  Private tailnet-only Serve remains intact. The unrelated concurrency test's
  import-loader failure remains documented in the upload safety notes.

#### 2. `legacy-disk-upload`: Receive legacy uploads on disk

Dependencies: `upload-admission`.
Core files: upload controller/module/service, admission interceptor, job-management service,
and `project/apps/api/test/disk-upload.test.cjs`.

- [x] Spool only admitted multipart files to private ID-named storage and
  enforce the administrator's limit during reception.
- [x] Reuse validated disk inputs for existing-shape job creation without
  retaining a receive buffer; preserve sheet discovery and ZIP/CRC checks.
- [x] Remove failed, oversized and interrupted temporary files safely;
  storage errors are explicit and existing filenames/job behavior are retained.
- Verify: API build; `node --test project\apps\api\test\disk-upload.test.cjs
  project\apps\api\test\application-settings.test.cjs
  project\apps\api\test\task4.test.cjs project\apps\api\test\task5.test.cjs`;
  actual exact-boundary multipart uploads and restart cleanup.
  Verified: 29 focused host tests passed; all 12 disk/admission tests passed
  again on the built Node 22 Linux API image, including real process
  termination/restart, byte preservation and exact 1/50 MiB archive boundaries.
  The memory-reception test failed before implementation; disabling receive-time
  settings enforcement makes the boundary test fail. API compile/web type-check
  and both Docker builds passed. Local stack rebuilt, existing health checks
  passed, app HTTP 200 and unauthorized upload HTTP 401 confirmed. All 92
  migrations applied and live/built-in history matches; Linux storage mode 0700
  and private tailnet-only Serve verified after daemon initialization.
  The known concurrency-test source-loader import failure remains unchanged.

#### 3. `session-storage`: Persist replay-safe upload intents

Dependencies: `legacy-disk-upload`.
Core files: Prisma schema/new migration, new upload-session service,
and `project/apps/api/test/upload-sessions.postgres.test.cjs`.

- [x] Enforce unique owner/client intents, immutable file/hash metadata,
  one unfinished session per owner, and atomic 1 GiB capacity reservation.
- [x] Record progress, terminal status, fixed expiry and stable completion ID
  without storing workbook bytes or credentials in database records.
- [x] Replay identical creation safely; reject changed metadata and prove
  simultaneous creations cannot exceed owner/global limits.
- Verify: API build; `node --test project\apps\api\test\upload-sessions.postgres.test.cjs` with
  `V6_UPLOAD_TEST_DATABASE_URL` pointing only to a guarded disposable database;
  test populated-schema migration without touching live account data.
  Verified: all 6 PostgreSQL storage checks passed, including populated upgrade,
  guarded down/up rehearsal, concurrent clients, exact 1 GiB/+1 rejection,
  progress/receipt immutability, real transaction rollback and fresh-process replay.
  Raising the database budget CHECK makes the direct-writer test fail.
  All 29 focused legacy upload/settings/workbook regressions passed.
  The full API run passed 155 tests, with 6 pre-existing opt-in skips and 2
  unchanged fixture failures: system-info's missing settings provider and the
  translation-concurrency source-loader import. These suites were not weakened.
  All 18 storage/disk/admission tests also passed in the built Node 22 Linux
  image using an isolated PostgreSQL namespace and read-only web-history fixture.
  API compile/web type-check and both Docker builds passed. Local services
  rebuilt and configured health checks passed; application/public system info
  returned 200, unauthenticated legacy upload returned 401 and unexposed session
  routes returned 404. All 93 migrations applied; live/built-in history matches
  exactly. Empty live session/budget state and private tailnet-only Serve verified.

#### 4. `session-lifecycle`: Expose owned session management

Dependencies: `session-storage`.
Core files: new session controller, session service, upload module,
and `project/apps/api/test/upload-session-http.test.cjs`.

- [x] Add create/status/cancel routes with existing authentication and typed
  metadata/progress responses; never expose storage paths or other owners.
- [x] Repeated cancellation is safe; expiry and cleanup do not delete a
  completed job or race a live upload operation.
- [x] Check reduced administrator limits and recover cleanup state at startup;
  storage failures remain distinct from retryable busy responses.
- [x] Audit owner deletion blocked by retained reservations. The database
  blocks deletion while reservations remain, but the existing admin controllers
  have no account-deletion route; HTTP conflict mapping is not applicable until
  such a route exists. Do not add a destructive endpoint for this task; any
  future route must return the repository's explicit conflict response.
- Verify: API build; `node --test project\apps\api\test\upload-session-http.test.cjs`;
  real authenticated HTTP requests, lowered settings and expiry/cleanup.
  Verified: 10 real JWT/HTTP/disposable-PostgreSQL lifecycle checks passed,
  including owner isolation, allowlisted metadata, repeated completed-session
  cancellation with retained temporary reservation, retry headers, lowered
  limits/replay, cancel/create races, restart expiry, bounded sweeps and
  symlink/foreign-marker refusal with reservation retention. Twenty older
  failed cleanup candidates no longer starve a later healthy expired session;
  each sweep remains bounded to 20. Uppercase UUID storage preparation uses the
  persisted canonical ID so cancellation removes bytes before releasing budget.
  The regressions failed before these fixes and pass afterward. The 6 guarded
  storage PostgreSQL checks and 12 disk/admission regressions passed; API
  build/type-check, web type-check and Prisma validation passed. Removing the
  owner filter makes the cross-owner HTTP assertion fail (200 instead of 404).
  Local Compose health, public system info, unauthenticated route guards,
  applied migration, matching database/built-in history, empty live sessions
  and zero reserved bytes were verified. Private Tailscale Serve remains
  tailnet-only at the existing URL/proxy. The owner-delete applicability audit
  is complete: the guarded PostgreSQL test confirms an owner with a retained
  reservation cannot be deleted, and the existing admin controllers have no
  account-deletion route. HTTP conflict mapping is not applicable until a route
  is introduced; that future route must surface the database block explicitly.

#### 5. `chunk-receive`: Acknowledge durable verified chunks

Dependencies: `session-lifecycle`.
Core files: session controller/service, targeted request-body parser helper,
web nginx chunk location, `upload-session-http.test.cjs` and existing
`upload-proxy.test.cjs`.

- [x] Accept sequential raw chunks with exact expected length/hash; safe
  replay never appends twice and skipped/altered chunks fail explicitly.
- [x] Acknowledge only after file sync and progress commit; reconcile
  unacknowledged tails after actual interruption without losing committed bytes.
- [x] Reject excess work before reading bodies, release the active slot between
  chunks, and retain unrelated nginx/body-limit protections.
- Verify: API build; real authenticated HTTP/process tests and guarded
  PostgreSQL storage regressions; enabled Docker nginx test; Node 22 Linux
  image; Compose migration/runtime/history checks.
  Verified after the paused draft was resumed: 23 authenticated HTTP,
  PostgreSQL and owned-process checks passed on both the host and Node 22 Linux.
  These cover headerless exact/short/oversized chunks, bounded reception without
  duplicate disk bytes, sync failures and handle closure, a real synced-tail
  crash following an acknowledged prefix, and a lock-controlled expiry between
  the transaction check and update. Six guarded PostgreSQL storage checks and
  30 legacy upload, settings, workbook and GraphQL checks passed in Node 22;
  the 30 legacy regressions also passed on the host. The enabled real-nginx
  test verified exact and oversized streamed requests and early busy responses
  with and without a trailing slash. API/web builds and type-checks passed;
  the local stack and matching changelog migration were refreshed. The private
  Tailscale sidecar was reattached after the web container was recreated, and
  the existing tailnet-only preview returned HTTP 200. This is not a
  power-loss guarantee: filesystem synchronization and PostgreSQL are separate.
  Task 6, browser recovery and 200 MB processing remain pending. The published
  draft contains task 4 because #67 did not propagate through the already
  merged integration parent; preserve that stacked history.

#### 6. `session-completion`: Finalize exactly one existing-shape job

Dependencies: `chunk-receive`.
Core files: session controller/service, job-management service,
and `project/apps/api/test/upload-session-http.test.cjs` (shared isolated
HTTP/PostgreSQL and owned-process fixture).

- [x] Validate complete bytes and sheets, reserve a stable job ID, and commit
  the job/queued notification/completed receipt atomically.
- [x] Retry or restart around file promotion and database commit creates exactly
  one job/notification; deleted completed jobs are never recreated on replay.
- [x] Permanent workbook failures clean up safely and preserve all existing
  archive/CRC/output defenses, ownership and job settings.
- Verified: API and web builds; `node --test project\apps\api\test\upload-session-http.test.cjs`
  against the guarded disposable database with actual
  API process termination at pre/post-promotion and pre/post-commit boundaries
  on Windows and Node 22 Linux; existing `task4.test.cjs` and `task5.test.cjs`
  regressions. Completion rechecks current administrator limits, isolates
  owners, retains reservations on cleanup failure, and refuses to remove
  unrelated job-path files. The unchanged proxy test requires its separate
  real-nginx environment. Filesystem synchronization and PostgreSQL are not a
  single power-loss transaction; these tests cover process termination.

#### 7. `browser-retention`: Save files for recovery

Dependencies: `session-storage` (approved metadata contract).
Core files: new workspace IndexedDB retention helper and
`tests/upload-retention.test.ts`.

- [x] Save File/Blob and owner/intent/hash/expiry metadata transactionally
  before transfer, with one unfinished retained file per account.
- [x] Request persistence where supported; quota, unavailable storage and
  expired/evicted data report explicit errors rather than a transport fallback.
- [x] Verify same-profile/origin restart and cleanup without reselection;
  store no credentials and read/hash one bounded chunk at a time.
- Verified: web type-check/build and
  `npx playwright test upload-retention.test.ts --workers=1 --retries=0`
  using real browser storage, including closing/reopening the same persistent
  browser profile, competing tabs, storage failures and expiry cleanup. The
  helper stores server reconciliation metadata with the earlier fixed deadline;
  transport, scheduled cleanup and automatic recovery remain later tasks.

#### 8. `resumable-client`: Transfer saved files with reconciliation

Dependencies: `session-completion`, `browser-retention`.
Core files: new upload-session API client and workspace transfer helper,
existing API client, and `tests/resumable-upload-client.test.ts`.

- Partial: an authenticated API transport handles session endpoints, raw
  chunks, validated response metadata, busy codes and retry headers while
  preserving tracked requests and session-expiry handling. An isolated
  real-server browser transfer has now been verified as described below.
  The transport is not wired into the existing upload UI.
- Partial: a reconciliation helper reuses the saved intent after an uncertain
  session-creation response, checks server file hashes and metadata, and saves
  server-confirmed progress without extending the local deadline. A guarded
  browser-storage update rejects a stale response if another tab changed the
  saved session or progress; manual pause prevents new reconciliation requests.
  An uncertain creation response is verified against the real server. The
  reconciliation helper alone is not a transfer loop or cross-tab lock.
- Partial: a one-chunk transfer primitive reconciles before each write, uses
  a fail-closed browser lock against concurrent transfers, checks acknowledged
  progress, and bounds requests. Tests simulate lost acknowledgements and
  competing tabs. It is not wired into the UI.
- Partial: a one-chunk retry wrapper uses the approved backoff, jitter and
  cooldown, honors longer Retry-After delays, and stops before expiry. It
  reconciles after uncertain writes, detects replacement intents, and does not
  retry authentication, validation or storage failures. Paused uploads do not
  start another attempt. A lost chunk acknowledgement was verified against the
  isolated real server; other real-server retry cases remain outstanding.
- Partial: a sequential transfer helper sends all remaining chunks using the
  retry wrapper, binds the entire transfer to the original intent, stops on
  pause or terminal session states, and rejects repeatedly regressing progress.
  Reaching the final byte does not finalize or claim a completed job. It is not
  wired into the UI. A multi-chunk workbook transfer was verified against the
  isolated real server.
- Partial: a guarded completion primitive reconciles the saved session, sends
  at most one completion request, and verifies an existing job receipt instead
  of recreating a deleted job. It shares the transfer lock and bounds requests;
  an uncertain outcome requires a new reconciled attempt. A lost completion
  response was verified against the isolated real server.
- Partial: a guarded cancellation primitive reconciles paused and uncertain
  sessions, confirms server cancellation before removing the browser copy, and
  preserves completed-job receipts for separate verification. It rejects stale
  storage snapshots and allows a
  known session to be cancelled after an upload-limit change. A lost
  cancellation response was verified against the isolated real server; other
  real-server cancellation cases remain open.
- Partial: completion retries use the approved backoff and reconcile each
  uncertain attempt, stopping for pause, replacement, expiry or permanent
  errors.
- Partial: cancellation retries reconcile uncertain responses, work for paused
  uploads and preserve completed-job receipts. They stop on abort, replacement,
  expiry and permanent errors. The isolated real-server lost-response case
  also verifies that the retry loop reconciles automatically; the UI is not
  connected.
- Partial: a same-tab pause helper commits the pause before aborting its active
  request and rejects a replaced intent without interrupting it. On resume,
  transfer reconciliation handles a chunk that may have reached the server.
- Partial: same-tab in-flight cancellation commits a pause, interrupts and
  settles the active request, and reconciles before cancelling. It preserves
  completed jobs and rejects replacement intents or permanent request errors.
  Interrupted committed-chunk and committed-completion cases are verified
  against the real server; other cases remain open and neither helper is
  connected to the UI.
- Partial: a cross-tab pause helper commits the pause before notifying the tab
  holding a transfer/completion lock; that tab checks the saved intent and
  pause state before interrupting. Notifications are best-effort, and resume
  must reconcile uncertain server outcomes.
- Partial: cross-tab cancellation persists pause, sends a best-effort
  interruption, and retries under the shared lock with reconciliation before
  each cancellation attempt. It keeps the file through server contention and
  preserves completed jobs; replaced intents and aborted waits are not deleted.
  Interrupted committed-chunk and committed-completion cases are verified
  against the real server; other cases and UI integration remain open.
- Partial: an opt-in browser test uses real IndexedDB, Vite, Nest and a
  disposable PostgreSQL container. It forwards one chunk and one completion
  request to the server, then drops their successful responses. Reconciliation
  preserves the exact workbook and produces one job and one notification. The
  transfer scenario does not cover API restarts, cancellation or UI integration.
  With the root and web dependencies, Playwright Chromium, Docker and the
  `postgres:16-alpine` image installed, run from the repository root after
  building the API: `$env:V6_REAL_BROWSER_TEST='1'; node --test
  project\apps\api\test\upload-session-http.test.cjs`. Do not set
  `V6_UPLOAD_HTTP_TEST_DATABASE_URL` when using the owned container.
- Partial: a second opt-in real-server browser test drops a committed chunk
  response, closes Chromium, reopens the same persistent profile, and manually
  invokes the recovery helpers without selecting the workbook again. It checks
  server reconciliation before later chunks, exact job bytes and one job and
  notification.
- Partial: another opt-in scenario performs the same lost-response and browser
  restart flow while terminating and restarting an owned API process on the
  same endpoint. It verifies reconciliation and a single intact job against
  disposable PostgreSQL. Recovery is invoked manually; automatic UI recovery,
  other cancellation cases and the complete runtime checkpoint remain unverified.
- Partial: an opt-in real-server cancellation test drops a successful DELETE
  response after one chunk. It verifies the local file is retained while the
  server has cancelled and released its storage, then manually retries and
  confirms server reconciliation precedes local cleanup. Other completed-job
  races, cross-tab cancellation and UI integration remain unverified against
  the real server.
- Partial: a second real-server cancellation scenario drops a successful
  response during the retry loop, checks the exact saved workbook while retry
  reconciliation is blocked, then confirms reconciliation precedes cleanup.
  This does not enable automatic UI recovery or cover other cancellation races.
- Partial: a real-server browser test completes an upload after cancellation
  reconciles but before its DELETE reaches the server. It verifies the returned
  completed receipt, retained workbook, exact job file and single notification.
  Other completion races and UI integration remain unverified.
- Partial: a real-server browser test interrupts a same-tab chunk after the
  server commits it but before the browser receives its response. It checks
  persisted pause and reconciled bytes before cancellation, followed by server
  and browser cleanup. Other in-flight and cross-tab cases remain open.
- Partial: a real-server browser test interrupts same-tab completion after the
  server commits it but before its response reaches the browser. Cancellation
  reconciles the completed receipt without issuing DELETE, retaining the exact
  workbook and preserving the single job and notification. Other completion
  orderings and cross-tab cases remain open.
- Partial: a real-server browser test cancels from a second tab after the
  server commits a chunk but before its response reaches the transferring tab.
  It verifies the interrupted transfer, persisted pause and reconciled bytes
  before cancellation and cleanup. Other cross-tab cases remain open.
- Partial: a real-server browser test cancels from a second tab after the
  server commits completion but before its response reaches the completing
  tab. It verifies interruption and reconciliation without DELETE, preserving
  the workbook, completed job and notification. Other orderings remain open.
- Partial: a real-server browser test drops a committed session-creation
  response, confirms the exact saved workbook while the retry is held, and
  verifies the same intent creates one session and one intact completed job.
  Recovery is invoked through the helper, not the application UI.
- Partial: a real-server browser test cancels in the same tab after session
  creation commits but before its response arrives. It verifies the paused
  workbook and original intent are reconciled before the server cancellation
  and browser cleanup. Other creation races and UI integration remain open.
- Partial: upload promotion and cleanup compare exact filesystem identities,
  including inode values beyond JavaScript's safe integer range; foreign
  files remain untouched in the collision regression.
- [ ] Reuse stable intent/session IDs, reconcile confirmed server offsets
  before writes, and recover unknown chunk/completion outcomes safely.
- [ ] Apply reviewed retry delays, timeouts, expiry and manual-pause state;
  authentication/hash/permanent failures never enter a network retry loop.
- [ ] Preserve tracked requests/session-expiry behavior and cross-tab safety;
  Cancel reconciles unknown work and never deletes a completed job.
- Verify: web type-check/build;
  `npx playwright test tests/resumable-upload-client.test.ts`;
  controlled network/ack failures plus real-server transfer before UI adoption.

#### 9. `upload-status-ui`: Present clear transfer controls

Dependencies: `resumable-client`.
Core files: new upload-status component, existing locale provider,
and `tests/upload-status.test.ts`.

- [ ] Show saving, uploading, offline, busy, paused, validating, completed
  and failed states with acknowledged progress and localized controls.
- [ ] Pause/Resume/Cancel and waiting-for-sign-in feedback are keyboard
  accessible; progress never implies successful completion before a job exists.
- [ ] Verify supported locales, themes and narrow/wide layouts without
  changing navigation, settings, translation controls or preview behavior.
- Verify: web type-check/build; `npx playwright test tests/upload-status.test.ts`;
  real browser keyboard checks and screenshots at 320 and 1440 pixels.

#### 10. `automatic-resume-integration`: Recover through app restarts

Dependencies: `upload-status-ui`.
Core files: ModernApp, workspace controller/page, and
`tests/resumable-uploads.test.ts`.

- [ ] Save before initial transfer; restore only under the authenticated
  saved owner on any app route, without reselection after refresh/restart.
- [ ] Logout/session expiry stops transfers but retains the file for the same
  owner; manual pause remains paused and success refreshes the existing job list.
- [ ] Prove real-server recovery on a throttled 10 Mbps connection, uncertain
  acknowledgments/finalization, multiple tabs, quota/expiry and cancel cleanup.
- Verify: API/web builds;
  `npx playwright test tests/resumable-uploads.test.ts tests/frontend.test.ts
  tests/system-settings.test.ts`; same persistent-profile restart with real
  disposable API/PostgreSQL/nginx and no live credential resets.

### Resumable runtime checkpoints

- [ ] After task 2: existing legacy upload/workbook regressions pass with
  bounded reception, safe cleanup and retryable admission.
- [x] After task 6: durable chunk/finalization guarantees pass actual crash,
  concurrency, storage-failure and ownership tests before browser adoption.
- [ ] After task 10: retained files automatically recover against the real
  server; verified metadata/progress/job outcomes survive browser/API restart.
- [ ] Publish each verified slice with synchronized history, local rebuild/
  health checks, detailed commit/push and appropriately stacked PR.
- [ ] Keep the separate 200 MiB safety/end-to-end task unchecked until real
  processing and pinned preview imports pass resource and exact-boundary tests.

## Integration checkpoint

- [ ] Run focused regression tests, API and web builds, and runtime checks.
- [ ] Rebuild and verify the local Compose services without removing volumes.
- [ ] Verify database and built-in changelog entries match each completed slice.
