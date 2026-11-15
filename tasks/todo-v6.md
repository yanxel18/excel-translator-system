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
- [ ] Review the delivery order, retry timing and persistent manual-pause
  behavior in [the delivery plan](plan-v6.md#resumable-upload-delivery-plan).
- [ ] Implement and verify retained-browser-file chunk uploads and automatic
  resume, including interrupted acknowledgments, exact limits, ownership,
  storage failures/expiry and crash-safe single-job finalization.
- [ ] Support configurable limits from 1 to 200 MB end to end and update
  translations and deployment documentation. Test real boundaries and rejection.

### Resumable delivery tasks

All tasks below remain pending delivery-plan approval. New test-file names
are planned targets, not commands claimed to have passed. API tests use the
existing `node --test` runner against built API code; browser tests use the
existing Playwright runner. Each task includes the contribution requirements
in the delivery plan.

#### 1. `upload-admission`: Bound active upload reception

Dependencies: None after plan approval.
Core files: new upload admission service/interceptor, upload controller/module,
and `project/apps/api/test/upload-admission.test.cjs`.

- [ ] Acquire one shared upload slot after authentication but before Multer
  reads the body; return `UPLOAD_BUSY`/409 with `Retry-After` for excess work.
- [ ] Release only after receive/validation/job creation settles; aborts,
  exceptions and shutdown cannot leak or prematurely release the slot.
- [ ] Preserve existing 50 MiB uploads, configured limits and translation slots.
- Verify: API build; `node --test project\apps\api\test\upload-admission.test.cjs`;
  real concurrent/aborted HTTP receives, including unauthorized requests.

#### 2. `legacy-disk-upload`: Receive legacy uploads on disk

Dependencies: `upload-admission`.
Core files: upload controller/module/service, job-management service,
and `project/apps/api/test/disk-upload.test.cjs`.

- [ ] Spool only admitted multipart files to private ID-named storage and
  enforce the administrator's limit during reception.
- [ ] Reuse validated disk inputs for existing-shape job creation without
  retaining a receive buffer; preserve sheet discovery and ZIP/CRC checks.
- [ ] Remove failed, oversized and interrupted temporary files safely;
  storage errors are explicit and existing filenames/job behavior are retained.
- Verify: API build; `node --test project\apps\api\test\disk-upload.test.cjs
  project\apps\api\test\application-settings.test.cjs
  project\apps\api\test\task4.test.cjs project\apps\api\test\task5.test.cjs`;
  actual exact-boundary multipart uploads and restart cleanup.

#### 3. `session-storage`: Persist replay-safe upload intents

Dependencies: `legacy-disk-upload`.
Core files: Prisma schema/new migration, new upload-session service,
and `project/apps/api/test/upload-sessions.postgres.test.cjs`.

- [ ] Enforce unique owner/client intents, immutable file/hash metadata,
  one unfinished session per owner, and atomic 1 GiB capacity reservation.
- [ ] Record progress, terminal status, fixed expiry and stable completion ID
  without storing workbook bytes or credentials in database records.
- [ ] Replay identical creation safely; reject changed metadata and prove
  simultaneous creations cannot exceed owner/global limits.
- Verify: API build; `node --test project\apps\api\test\upload-sessions.postgres.test.cjs` with
  `V6_UPLOAD_TEST_DATABASE_URL` pointing only to a guarded disposable database;
  test populated-schema migration without touching live account data.

#### 4. `session-lifecycle`: Expose owned session management

Dependencies: `session-storage`.
Core files: new session controller, session service, upload module,
and `project/apps/api/test/upload-session-http.test.cjs`.

- [ ] Add create/status/cancel routes with existing authentication and typed
  metadata/progress responses; never expose storage paths or other owners.
- [ ] Repeated cancellation is safe; expiry and cleanup do not delete a
  completed job or race a live upload operation.
- [ ] Check reduced administrator limits and recover cleanup state at startup;
  storage failures remain distinct from retryable busy responses.
- Verify: API build; `node --test project\apps\api\test\upload-session-http.test.cjs`;
  real authenticated HTTP requests, lowered settings and expiry/cleanup.

#### 5. `chunk-receive`: Acknowledge durable verified chunks

Dependencies: `session-lifecycle`.
Core files: session controller/service, upload admission helper,
`upload-sessions.postgres.test.cjs` and existing `upload-proxy.test.cjs`.

- [ ] Accept sequential raw chunks with exact expected length/hash; safe
  replay never appends twice and skipped/altered chunks fail explicitly.
- [ ] Acknowledge only after file sync and progress commit; reconcile
  unacknowledged tails after actual interruption without losing committed bytes.
- [ ] Reject excess work before reading bodies, release the active slot between
  chunks, and retain unrelated nginx/body-limit protections.
- Verify: API build; `node --test project\apps\api\test\upload-sessions.postgres.test.cjs`
  against the guarded disposable database; and
  `$env:UPLOAD_PROXY_DOCKER_TEST="1"; node --test project\apps\api\test\upload-proxy.test.cjs`;
  real 1 MiB chunks, shorter final chunks, one-extra-byte rejection and lost acks.

#### 6. `session-completion`: Finalize exactly one existing-shape job

Dependencies: `chunk-receive`.
Core files: session controller/service, job-management service,
and `project/apps/api/test/upload-completion.postgres.test.cjs`.

- [ ] Validate complete bytes and sheets, reserve a stable job ID, and commit
  the job/queued notification/completed receipt atomically.
- [ ] Retry or restart around file moves and database commit creates exactly
  one job/notification; deleted completed jobs are never recreated on replay.
- [ ] Permanent workbook failures clean up safely and preserve all existing
  archive/CRC/output defenses, ownership and job settings.
- Verify: API build; `node --test project\apps\api\test\upload-completion.postgres.test.cjs`
  against the guarded disposable database with actual
  API process termination at pre/post-move and pre/post-commit boundaries;
  existing `task4.test.cjs` and `task5.test.cjs` regressions.

#### 7. `browser-retention`: Save files for recovery

Dependencies: `session-storage` (approved metadata contract).
Core files: new workspace IndexedDB retention helper and
`tests/upload-retention.test.ts`.

- [ ] Save File/Blob and owner/intent/hash/expiry metadata transactionally
  before transfer, with one unfinished retained file per account.
- [ ] Request persistence where supported; quota, unavailable storage and
  expired/evicted data report explicit errors rather than a transport fallback.
- [ ] Verify same-profile/origin restart and cleanup without reselection;
  store no credentials and read/hash one bounded chunk at a time.
- Verify: web type-check/build;
  `npx playwright test tests/upload-retention.test.ts` in real browser storage,
  including closing/reopening the same persistent browser profile.

#### 8. `resumable-client`: Transfer saved files with reconciliation

Dependencies: `session-completion`, `browser-retention`.
Core files: new upload-session API client and workspace transfer helper,
existing API client, and `tests/resumable-upload-client.test.ts`.

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
- [ ] After task 6: durable chunk/finalization guarantees pass actual crash,
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
