# Version 6 implementation plan

Created: 2026-11-15. Status: In progress.
Task tracker: [todo-v6.md](todo-v6.md).

## Objective

Make the login username the user's GID, collect a separate full name, simplify
bases and navigation, schedule maintenance notices, and allow administrators
to configure workbook uploads up to 200 MB.

## Capability map and build order

| Module | Responsibility | Dependencies |
|---|---|---|
| identity-bases | GID login, full names and acronym-only bases | Existing authentication and persistence |
| navigation | Translate File label and sidebar settings/changelog links | Existing permissions and routing |
| maintenance | Administrator scheduling and user-facing notice | Existing authentication and settings |
| uploads | Adjustable 200 MB ceiling and automatic resumable uploads | Existing upload, authentication and workbook validation |
| integration | Combined tests, deployment guidance and changelog | All completed modules |

Implement independently testable slices, with identity/base migrations planned
before changing dependent forms and interfaces. Each slice must remain usable,
have focused tests, and record its user-visible changes in the database-backed
and built-in changelog.

## Decisions and boundaries

The focused base-key migration preserves every record and identity. `Base.code` is the
primary key, with unique immutable UUID `Base.id` retained for compatibility.
See [migration scope and evidence](../project/docs/v6-base-primary-key-migration.md).
The base interface and versioned base API now expose a single acronym. The
wider account migration and acronym-based user API remain pending.

- The user confirmed the existing database contains test data and may be wiped
  if necessary. Prefer a non-destructive migration; do not delete data or
  volumes merely for convenience.
- A username is the login GID, including user-selected names. Full names are
  separate, support Japanese and English, and are limited to 50 characters.
  Keep passwords hashed and enforce uniqueness and validation server-side.
- A base is represented to users by one acronym, such as JTY or MSTY. Its
  acronym is the intended database primary key. Protect user relationships and
  update assigned users atomically when an acronym is edited. Reject duplicate
  values.
- Reject OIDC sign-in when the provider supplies a full name longer than 50
  Unicode code points; ask the user to correct the provider name. Enforce the
  same maximum in PostgreSQL without truncation or discarding names. This
  focused slice adds a reversible CHECK; it is not the broader base-key migration.
- Rename the Workspace navigation action to Translate File. Move System
  Settings and Changelog from the avatar menu to the sidebar, preserving
  authorization, responsive behavior and translations.
- Maintenance is an informational banner, not an access lock. Administrators
  manage a start and end time; store unambiguous instants and show the time
  zone to users. Specify scheduling and visibility details before building.
- Preserve the configured upload limit and default unless changed by an
  administrator. The maximum setting is 200 MB. Account for proxy, parser,
  workbook validation and preview limits, and memory use with concurrent
  uploads; test actual request boundaries rather than only form validation.
  The [upload safety trace](../project/docs/v6-upload-safety.md) selects disk
  spooling and bounded workbook processing before enabling the 200 MB ceiling.
  The proxy prerequisite restores current 50 MB uploads without enabling 200 MB.
- The user confirmed automatic chunked upload recovery for slow or unstable
  connections. Retain a temporary browser copy and resume for 24 hours after
  refresh or browser restart, without normal-path file reselection. Allow one
  active receive/validation operation with a retryable busy response; paused
  sessions must not block other users. Translation concurrency stays separate.
- Do not deploy publicly or enable Tailscale Funnel. Follow existing
  localization and accessibility patterns; do not add dependencies without
  need.

## Verification

Run focused API, migration, and browser tests for each slice. Verify real
requests at relevant size limits, admin authorization, multilingual names,
maintenance schedule boundaries, and desktop/mobile navigation. Run type
checks and builds; rebuild the local Compose stack when application code
changes, without deleting named volumes. Verify changelog entries match.
For the focused full-name storage/OIDC task, validate migration and reversal
with the opt-in disposable PostgreSQL test before deploying to the local stack.

## Resumable upload specification

Status: **Protocol and defaults approved by the user on 2026-11-15**. This extends the `uploads`
capability; it does not enable the 200 MB setting or change runtime behavior.
The confirmed user outcome is automatic recovery, not increased link bandwidth.

### Objective and scope

Users on slow or unstable site links can upload a workbook in small chunks.
Acknowledged bytes are not uploaded again after a lost connection, refresh or
browser restart. Recovery uses the saved file automatically in the same browser
profile and application origin, once the same account is authenticated.
Closing the browser stops transfer; reopening resumes it. Cross-device,
cross-origin and closed-browser background transfer are out of scope.

Preserve existing local/OIDC authentication, ownership, selected-sheet behavior,
ZIP/CRC/output validation and administrator upload/translation settings. Keep the
legacy `/upload` API compatible. Do not enable 200 MB until the processing and
preview gates in [the safety strategy](../project/docs/v6-upload-safety.md) pass.

### Proposed browser retention

- Persist the selected `File`/`Blob` and upload metadata in IndexedDB before
  starting network transfer. Show "Saving file for automatic resume" until the
  transaction commits; an immediate close before that commit cannot be recovered.
  Do not encode the file into localStorage, JSON arrays or base64.
- Store the owner ID, stable client upload ID, file metadata, chunk hashes,
  server session ID, confirmed progress and expiry. Never store credentials in
  this upload record. Read/hash one chunk at a time, not a 200 MiB ArrayBuffer.
- Keep one unfinished local file per account. Opening another tab must not create
  another logical upload or duplicate the completed job.
- Resume automatically on page load, authenticated-account restoration and
  network recovery. Query the server's confirmed progress before sending more.
  If sign-in is needed, show that the saved upload is waiting; never send it
  under another account.
- Remove the browser copy on completion, explicit cancellation, permanent
  workbook-validation failure or expiry.
  The recovery deadline is 24 hours from local selection/server session creation,
  using the earlier deadline. It is not extended indefinitely by retries.
  Delete expired local copies on the next app start and while the app is open;
  a closed browser cannot run an exact-time deletion timer.
- Request persistent origin storage where supported. If saving fails or quota
  is unavailable, stop before transfer and explain how to free space/retry.
  Do not silently fall back to a non-resumable upload.
- Browser storage is origin-scoped. Clearing site data, private-mode shutdown
  or browser eviction can remove the saved file; report that explicitly rather
  than claiming automatic recovery. Changing from localhost to the tailnet URL
  does not share the browser copy. No implementation can override these limits.

Storage behavior is grounded in
[MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

### Proposed additive API contract

Routes below are relative to the existing API prefix. Require the existing
authenticated owner on every operation; IDs are not authorization.

| Method and resource | Contract |
|---|---|
| `POST /upload-sessions` | Accept a stable `clientUploadId`, `fileName`, `fileSize`, and ordered SHA-256 chunk hashes. Atomically create/replay the same owner's intent; different metadata with the same ID is a conflict. |
| `GET /upload-sessions/:id` | Return immutable file/chunk metadata, status, acknowledged bytes, next chunk index, chunk size, expiry and completed job ID, never filesystem paths or another owner's session. |
| `PUT /upload-sessions/:id/chunks/:index` | Receive one raw binary chunk. Validate its expected index, exact length and recorded hash. A matching acknowledged retry is safe; mismatched data is rejected. |
| `POST /upload-sessions/:id/completion` | Validate the complete workbook and create exactly one existing-shape job/queued notification. Repeat or uncertain-outcome retries return the same completed job; in-flight duplicates get a busy response. |
| `DELETE /upload-sessions/:id` | Cancel an unfinished session and delete its owned temporary data. Repeated cancellation is safe; never delete a completed job through this endpoint. |

Propose fixed 1 MiB chunks (1,048,576 bytes), except the shorter final chunk.
Hash the ordered chunks before session creation and compare server-confirmed
hashes when resuming. This detects wrong or mixed file contents without hashing
the entire file in one allocation. Only acknowledge bytes after their durable
write and database progress commit. Reject empty/oversized chunks, skipped
indices, altered hashes, invalid filenames and unexpected metadata fields.

Follow Nest's existing HTTP error shape. Add a machine-readable `UPLOAD_BUSY`
code and `Retry-After` for the retryable 409 response. Wrong-owner requests fail
without revealing file metadata. Expired sessions report expiry explicitly.
Storage failures must not be returned as success or confused with a busy slot.

Style follows existing typed API contracts, for example:

```ts
interface CreateUploadSessionInput {
  clientUploadId: string;
  fileName: string;
  fileSize: number;
  chunkHashes: string[];
}

interface UploadSession extends CreateUploadSessionInput {
  id: string;
  status:
    | "RECEIVING"
    | "FINALIZING"
    | "COMPLETED"
    | "CANCELLED"
    | "EXPIRED"
    | "FAILED";
  bytesReceived: number;
  nextChunkIndex: number;
  chunkSize: number;
  expiresAt: string;
  jobId: string | null;
}
```

### Proposed server storage and capacity

- Add owner-linked Prisma upload-session records with stable client intent IDs,
  immutable file/chunk metadata, confirmed progress, expiry and stable job ID.
  Store file bytes only under a private temporary directory in existing data
  storage, named by server-generated IDs, never by client filenames.
- One active legacy receive, chunk write or upload finalization at a time across
  owners. Check capacity before reading/allocating a request body. Release it
  only when the operation settles, not merely when a client disconnects.
  Paused sessions hold no active slot; they retain only reserved disk capacity.
- Propose one unfinished server session per owner and a global 1 GiB temporary
  upload reservation budget. Reserve the declared file size atomically at
  creation and release it on cancellation, expiry, permanent validation failure
  or successful completion. Delete failed sessions' temporary bytes safely.
  If capacity is unavailable, return an explicit retryable error. This budget
  excludes existing completed workbook storage; it is not a host-memory budget.
- Persist chunks to disk without retaining the whole upload in memory. On a
  failed append or restart, reconcile the file against committed progress and
  discard only an unacknowledged tail before accepting another chunk.
- Finalization must reconcile filesystem moves with database state after an
  actual process crash. A timeout after job creation must not create another
  job or notification on retry. Keep completed session receipts through their
  recovery deadline, even after temporary bytes are moved into job storage.
- Expire sessions after 24 hours; run cleanup at startup and periodically.
  Cleanup must not race an active write or delete completed workbook files.
  Resolve/check owned targets below the private upload root, rejecting
  symlinks/path traversal. Never delete application roots or named volumes.
- A configured limit lowered during an unfinished upload is enforced again
  before accepting further chunks and finalization, with actionable feedback.
  Do not modify existing administrator values or the 50 MB default.

### Retry and user experience

Show saved-file name, acknowledged-byte progress, transfer rate/ETA when known,
and distinct saving, uploading, waiting-for-network, busy, paused, validating,
completed and failed states. Provide Pause, Resume and Cancel controls with
localized labels and accessible status announcements.

Send chunks sequentially. On network errors, transient gateway failures or
busy responses, reconcile progress then retry with bounded exponential backoff
and jitter, honoring `Retry-After`. After a bounded retry burst, wait before
another burst or network recovery; never spin or restart the entire file.
Do not retry authentication, hash, expiry or permanent validation errors as if
they were connection failures. Cancellation after an uncertain write outcome
must reconcile state before cleanup. Never display completion until the
server returns the completed job.

### Commands, source boundaries and success criteria

Use API source/tests under `project/apps/api/src/modules/file-upload` and
`project/apps/api/test`, additive Prisma migrations, and web API/workspace
code under `project/apps/web/src`. Extend the existing Playwright tests under
`tests`; use disposable PostgreSQL for crash and transactional guarantees.
No new dependency, auth flow, public deployment or editor fork is approved.

- Always: retain authentication/ownership checks, validate untrusted input,
  run focused regression tests and synchronize both changelog sources.
- Ask first: approve this protocol and its upload-session schema before
  implementation; obtain approval for dependencies or broader runtime changes.
- Never: commit credentials, bypass workbook safety checks, remove failing
  tests to pass a gate, or remove named volumes.

```powershell
npm --prefix project\apps\api run build
node --test project\apps\api\test\application-settings.test.cjs project\apps\api\test\task4.test.cjs project\apps\api\test\task5.test.cjs
Push-Location project\apps\web
npx tsc --noEmit
npm run build
Pop-Location
npx playwright test tests/frontend.test.ts tests/system-settings.test.ts
$env:UPLOAD_PROXY_DOCKER_TEST = "1"
node --test project\apps\api\test\upload-proxy.test.cjs
docker compose up --build -d
docker compose ps
```

These commands cover existing regressions. Add the focused resumable-upload
and crash-test commands to this section when their tests are implemented.
Keep builds/tests green per slice; record matching database/built-in changelogs
and commit/push/create the reviewed stacked PR before the next slice.

Success requires actual interrupted-transfer, refresh and browser-restart tests
using the same persistent browser profile, retained IndexedDB files and no
reselection, including an uncertain
chunk acknowledgment and finalization response. Verify exact chunk/file limits,
wrong-owner/hash rejection, multiple-tab retries, busy-slot release, temporary
budget/expiry, quota failure, cleanup, and real process-crash recovery. Simulate
a 10 Mbps link with latency/disconnection to verify bounded retransmission,
not a claim that chunking increases bandwidth. Run existing workbook regressions.
Measure resources and test real 200 MiB processing/preview before raising the
end-to-end ceiling; testing only padded files or mocked editor messages is
insufficient. Native-storage restrictions must produce honest recovery errors.

Approved: 1 MiB chunks, one unfinished session per owner, a 1 GiB server
temporary reservation budget, and the API/retention semantics above.

## Resumable upload delivery plan

Status: **Delivery plan and task list approved; implementation in progress**.
The task list is the `uploads` section of [todo-v6.md](todo-v6.md), not a
second tracker. This plan implements recovery at the current 50 MiB ceiling.
The separate 200 MiB processing/preview gates remain open.

### Architecture grounded in existing code

- `FileUploadController` authenticates before the admitted Multer parser.
  Shared admission protects reception, validation, job creation and cleanup.
  Legacy reception now uses private disk storage with the configured receive
  ceiling. The current response shape and 50 MiB ceiling remain.
- `DatabaseJobManagementService.createJob` chooses a fresh ID and creates a
  job/queued notification. It now accepts validated disk inputs as well as
  legacy buffers: disk files are promoted without a receive buffer, and the
  existing filename, sheet and job-shape logic is retained. For resumable
  completion, reserve a stable job ID before moving bytes and commit the job,
  notification and completed session receipt in one database transaction.
  Restart reconciliation must recognize both pre-move and post-move states.
- The job service already enforces one API instance with a PostgreSQL singleton
  lock and exits on lock loss. Preserve that contract; do not introduce replica
  support or another distributed-lock system. Use one shared active-upload slot
  inside that admitted instance. Reserve session capacity in short database
  transactions, never hold a database transaction open while a client uploads.
- Session metadata now has unique owner/client-intent keys and a partial index
  for one unfinished or still-reserved session per owner. A managed singleton
  row and session trigger enforce the atomic 1 GiB reservation total, including
  direct session writes. Metadata, acknowledged progress, deadlines and terminal
  receipts are guarded in PostgreSQL. Only metadata is stored there; temporary
  bytes will be contained under the existing data directory.
  The internal creation service replays identical intents, rejects changed
  metadata/expired recovery, and obtains creation/deadline timestamps from the
  database clock. Terminal status alone never releases uncleaned reservations.
  Lifecycle routes, cleanup and chunk writes are the next slices.
- A raw chunk is exactly 1 MiB or shorter. Test it through the existing nginx
  1 MiB general API envelope; multipart headers are not part of this chunk
  protocol. Do not broaden unrelated JSON route limits.
- The API client already has tracked requests and session-expiry handling.
  Preserve them and expose validated busy-code/retry-header data needed by
  the uploader. Cancellation returns a JSON session response, compatible with
  the existing JSON request helper.
- `ModernApp` owns the token/profile and constructs the workspace controller
  regardless of the current route. Recover only after the authenticated profile
  identifies the saved owner. Session expiry/logout stops network work without
  deleting the retained file. Never derive ownership from an unverified token.
- Keep native IndexedDB retention separate from network retry logic. Hash one
  chunk at a time; do not add a dependency or retain a full-file ArrayBuffer.
  Cross-tab coordination must not create another intent; server replay/progress
  guards remain authoritative even if two tabs attempt the same transfer.

### Delivery order and checkpoints

`upload-admission -> legacy-disk-upload`

`legacy-disk-upload -> session-storage -> session-lifecycle -> chunk-receive
-> session-completion`

`session-storage -> browser-retention`

`session-completion + browser-retention -> resumable-client`

`resumable-client -> upload-status-ui -> automatic-resume-integration`

Implement serially in this shared checkout. The independent browser-retention
branch of the graph is an option, not a reason to add parallel agents.
Each task has acceptance criteria, verification and expected files in the
existing tracker. Count core implementation files separately from mandatory
changelog/documentation updates.

- Checkpoint after legacy disk reception: existing multipart uploads, sheet
  selection, CRC/ZIP rejection and job responses still work; busy work and
  failed receives do not leak memory, disk or admission.
- Checkpoint after session completion: real HTTP/disk/PostgreSQL tests prove
  progress durability, ownership, capacity and exactly one job/notification
  after actual API process termination. No browser switch before this passes.
- Final checkpoint: real server plus the same persistent browser profile prove
  automatic recovery, uncertain acknowledgments, account isolation and cleanup.
  Mocked transport tests supplement, not replace, these runtime checks.
  Crash tests terminate only their own disposable API process, never the
  shared development stack.

### Approved retry and manual-pause details

Use five retry delays of 1, 2, 4, 8 and 16 seconds, with up to 20% added jitter,
then a 30-second cooldown before another burst. Honor a valid longer
`Retry-After`, but never retry beyond expiry. Use bounded request timeouts and
reconcile unknown outcomes before another write/completion request.
An explicit manual pause is persisted and survives refresh/restart; only
Resume clears it. Automatic recovery applies to interrupted, not manually
paused, uploads. Pausing never discards the retained file.

### Risks and scope boundaries

File sync and a database commit are not one atomic operation. Reconcile from
committed progress before truncation after an uncertain database outcome;
never discard acknowledged bytes based on a stale in-memory offset.
Do not release a reservation until temporary-byte cleanup is resolved, or
report a storage failure and retain enough metadata for safe cleanup.
Completed job deletion must not cause completion replay to recreate that job.

The remaining whole-buffer ZIP processing and browser/Wasm imports are not
certified for 200 MiB by disk reception. Keep administrator choices/defaults,
translation concurrency, archive limits, authentication and previews unchanged
until their separate safety work is verified. Do not rewrite published history.

Every completed slice requires focused tests, both builds as applicable,
matching database/built-in history, local Compose rebuild/readiness checks,
private Tailscale checks when networking changes, and a detailed commit,
push and stacked PR. Never delete named volumes or touch unrelated generated
changes to get a clean worktree.

## Risks

| Risk | Mitigation |
|---|---|
| Account and base key migration breaks sign-in or foreign keys | Exercise migrations and relations on a disposable database before applying; preserve data if feasible. |
| Large workbooks exhaust memory or fail in a hidden layer | Trace every size limit and processing cap; test actual uploads and document resource requirements. |
| Browser copy is lost or retained beyond logical expiry | Report storage failures/eviction honestly; request persistence, enforce the 24-hour recovery deadline, and purge expired copies when the app can run. |
| A lost upload response creates duplicate data or jobs | Stable intent IDs, hash-checked chunk replay, committed progress reconciliation and real crash tests. |
| Maintenance dates are misleading across time zones | Persist instants, validate ordering, show local zone and test boundaries. |
| Sidebar changes expose admin actions or hide them on mobile | Retain server authorization and verify each role at narrow and wide sizes. |
