# V6 workbook upload limits and safety

Date: 2026-11-15. The 200 MB setting is **not enabled yet**.
The application currently supports administrator-configured limits from 1 to
50 MB. Existing code uses `MB` to mean 1,048,576 bytes (MiB); retain that
interpretation when adding the 200 MB ceiling.

## Current request path

| Layer | Current limit or behavior |
|---|---|
| Workspace file selection | Uses `maxUploadSizeMb` from system info; defaults to 50. Checks extension and file bytes, not multipart bytes. |
| Web nginx `/api/upload` | 51 MiB request-body ceiling, allowing a 50 MiB file plus multipart headers. Other API routes retain nginx's default 1 MiB body ceiling. |
| Web nginx chunk PUT | Dedicated `/api/upload-sessions/:id/chunks/:index` location accepts at most one raw 1 MiB chunk and disables proxy request buffering. |
| Tailscale Serve | Proxies the same web nginx at port 80; does not bypass the upload location or require Funnel. |
| Nest upload controller/module | Authentication precedes admission and parsing. One file is streamed to private disk at the persisted 1-50 MiB receive ceiling; admission includes receive/validation/job creation/cleanup. |
| Upload service | Rechecks the persisted limit, validates extension/size, opens the disk archive and verifies CRC32/ZIP defenses once, returning worksheet metadata rather than a receive buffer. |
| Job creation | Promotes validated disk bytes into ID-named source storage and creates the existing-shape job/queued notification, retaining the buffer input for existing internal callers. Removes the source on failure. |
| Job details/settings | Read the whole source and reopen it to discover sheets. These operations are not controlled by the translation-start limit. |
| Translation start/retry | Global database admission limit of 1-5 workers. Workers read the whole source, extract text, translate bounded batches, patch the ZIP and validate the output. |
| OOXML archives | Reject more than 250 MiB declared uncompressed data, over 10,000 entries, or expansion above 200:1 for entries larger than 1 MiB. Reject unsupported ZIP formats, unsafe/duplicate paths and corrupt archives. |
| Output validation | Holds original/output buffers and opens both archives; compares package parts and parses output XML. |
| History table preview | SheetJS reads the whole file before slicing displayed rows to 50 and columns to 20. The display limit is not a parsing-memory limit. |
| ibis preview file endpoint | Owner-authorized endpoint streams the file from storage. |
| Parent iframe adapter | Downloads an ArrayBuffer, checks 50 MiB, then transfers it with `postMessage` rather than deliberately copying it. |
| Preview bridge | Independently checks 50 MiB; feeds bytes into the pinned ibisOffice browser/Wasm release. Requires WebGPU and HTTPS or localhost. |
| Legacy JSON workbook endpoints | `workbookBuffer` caps buffer arrays at 50 MiB; Nest/Express JSON parsing uses the framework's default body limit. These are not a large-file transport. |

The proxy used to inherit nginx's 1 MiB limit for uploads. The focused fix
changes only the canonical `/api/upload` route; it does not raise the application's
50 MiB ceiling, change persisted settings, or remove any ZIP defense.

Sources: [web nginx](../apps/web/nginx.conf),
[workspace](../apps/web/src/features/workspace/useWorkspaceController.ts),
[upload module](../apps/api/src/modules/file-upload/file-upload.module.ts),
[upload controller](../apps/api/src/modules/file-upload/file-upload.controller.ts),
[upload validation](../apps/api/src/modules/file-upload/file-upload.service.ts),
[job operations](../apps/api/src/modules/job-management/database-job-management.service.ts),
[archive validation](../apps/api/src/modules/workbook-ooxml/archive.ts),
[output validation](../apps/api/src/modules/workbook-ooxml/validator.ts),
[history previews](../apps/api/src/modules/product-surfaces/product-surfaces.service.ts),
[parent preview](../apps/web/src/features/history/IbisPreview.tsx),
[preview bridge](../../deployment/ibis-preview/bridge.html), and
[legacy buffer validation](../apps/api/src/common/workbook-input-validation.ts).

## Memory implications

Raising Multer's constant alone is unsafe:

- The 1-5 translation admission limit does not bound receiving uploads,
  sheet-discovery requests or preview parsing.
- Five simultaneous 200 MiB source buffers consume 1,000 MiB before ZIP state,
  strings, parsed XML, extracted items, translated output and HTTP buffering.
  Five workers each holding a source and same-sized output would consume
  2,000 MiB in those buffers alone. These are arithmetic lower bounds, not
  measured peak memory or a recommended container size.
- ZIP expansion and XML object/string allocation add memory independently of
  compressed file size. A small highly compressed worksheet can be more
  expensive than a 200 MiB workbook containing stored media.
- JSZip's CRC verification streams entry contents but launches checks for all
  entries concurrently. This does not necessarily retain all decompressed
  bytes, but it is not a single-entry work bound.
- Whole-file reads and browser/Wasm import remain expensive even when ingress
  is moved to disk. The displayed 50x20 cell preview is not streaming.
- Compose currently defines no API memory limit. There is no measured resource
  budget certifying 200 MiB processing or mobile preview.

On 2026-11-17, new jobs began storing the worksheet names already discovered
during upload. Opening job details or changing settings for those jobs no longer
reads and parses the source workbook again. Older jobs without saved names
continue to read their source files. This reduces repeated work but does not
bound upload validation, translation, legacy job reads or preview parsing, so
the 200 MiB setting remains disabled.

## Selected implementation strategy

The user subsequently confirmed chunked transfers with a retained browser file
and automatic resume after refresh/browser restart for 24 hours, without normal
file reselection. The [resumable-upload specification](../../tasks/plan-v6.md)
and defaults were approved by the user on 2026-11-15. The
[delivery plan](../../tasks/plan-v6.md#resumable-upload-delivery-plan) and task
list are approved. The protocol adds durable upload-session progress, bounded
chunk replay and browser-storage failure handling to the strategy below.
The API now implements durable session progress and raw chunk reception.
Browser file retention/automatic resume and the 200 MB ceiling are not enabled
yet.

### Completed admission prerequisite

The existing multipart route now admits one upload at a time after its
authentication guard and before parsing its body. Other uploads receive a
Nest-compatible 409 with `code: UPLOAD_BUSY` and `Retry-After: 1`.
The slot stays occupied through validation and job creation even if the client
disconnects. Parser failures/aborted receives release it after settling, and
shutdown rejects new work while draining the active upload.

The project already depends on Multer 2.5.0, but Nest 10's built-in
`FileInterceptor` resolves nested Multer 2.0.2. A real partial-request abort
exposed that older parser leaving reception unsettled. The admission interceptor
therefore invokes the already-installed API Multer parser directly using the
existing module storage/options, then awaits the existing route handler.
Multer error codes are mapped to Nest's canonical messages to preserve existing
400/413 responses. No dependency or lockfile changed.

The six focused tests use real Nest/Multer HTTP reception with delayed
validation/job test doubles. They prove rejection before an incomplete request
body, authentication ordering, abort/validation/job-error release, disconnection
during validation/job creation, shutdown/idempotent release, and the exact
50 MiB file boundary plus rejection of one extra byte. Existing settings and
workbook preservation/validation tests also pass. Removing admission makes the
overlap regression fail. Admission tests alone do not certify disk reception
or resumable uploads; the disk-reception verification is recorded below.

Framework sources: [Nest interceptors](https://docs.nestjs.com/interceptors#call-handler)
and [RxJS lastValueFrom](https://rxjs.dev/api/index/function/lastValueFrom);
the installed RxJS 7.8.2 source documents completion/error settlement. The
upload handler is a finite JSON operation, not a streaming-response route.

An additional existing `translation-concurrency.test.cjs` run failed to resolve
its source-transpilation import of `application-settings.service`. Neither that
test nor the job service changed in the admission slice; the failure is recorded rather
than silently changing unrelated code or claiming that suite passed.

### Completed legacy disk reception prerequisite

Admitted uploads now stream through Node's `pipeline` into a private
`DATA_DIR/legacy-uploads/receive-*` directory, using server-generated UUID
filenames and exclusive creation. The Linux deployment uses directory/file
modes 0700/0600; Windows additionally relies on the local account's filesystem
ACLs. Original filenames never select storage paths.

The current administrator limit is applied to Multer before reception and
rechecked before validation; oversized uploads now report 413 even at lower
settings. Multer's over-limit probe may write one extra byte while detecting
the boundary. Validation still reads one bounded archive into memory for the
existing CRC32/ZIP/worksheet checks. Only path/size/sheet metadata reaches job
creation, not a receive buffer or archive object.

Job creation links the private file into exclusive ID-named source storage,
then unlinks the temporary name. Both locations share the existing data
filesystem, so no JavaScript whole-file copy or overwrite is needed. Link,
unlink, receive and cleanup storage failures are reported explicitly.
Failed persistence removes the promoted source. Reception waits for its
writer streams to settle before cleanup and admission release.

Startup cleanup uses `onApplicationBootstrap`, after all module initializers
(including the existing database singleton lock) and before HTTP listening.
It removes only reserved receive directories in the private legacy root;
unrelated entries and symlinks are left alone, and job sources are not scanned.
A crash during later job publication is not certified by this receive-cleanup
slice; durable session completion/reconciliation remains a later task.
Legacy upload POSTs still generate a new job per accepted request and are not
safe to automatically retry after an unknown completion response.

Six disk tests use real Nest/Multer, files and archive validation with
controlled persistence. They cover byte-preserving job results, exact 1 MiB
and 50 MiB valid archives/+1 rejection, bounded bytes before a partial body
ends, CRC/format/persistence cleanup, explicit storage failure and real
process termination/restart cleanup without deleting job/foreign paths.
The first test fails on prior memory reception; disabling the receive-time
settings limit makes the boundary regression fail (400 instead of 413).
Admission tests continue to use real disk reception with validation/job doubles.

Sources: [Multer file/storage API](https://expressjs.com/en/resources/middleware/multer/),
[Node pipeline](https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options),
and [Nest lifecycle hooks](https://docs.nestjs.com/fundamentals/lifecycle-events#lifecycle-events-1).
No dependency or lockfile change is required. Automatic resume and the
200 MiB processing/preview certification remain pending.

### Completed upload-session storage prerequisite

The additive `UploadSession` schema and internal service now persist owner/client
intent IDs, ordered SHA-256 hashes, declared bytes, acknowledged progress,
status, an immutable 24-hour deadline and a stable completion UUID. File bytes,
storage paths and credentials are not stored in session records. The service
validates metadata before reserving space; JSON filenames are not decoded as
multipart Latin-1 or used as paths. A matching replay returns the same record,
including terminal receipts. Changed metadata conflicts; expired replay reports
410 without creating another deadline or freeing uncleaned storage.

A partial unique index allows only one receiving/finalizing or still-reserved
session per account. A trigger atomically adjusts the singleton reservation row,
whose CHECK enforces exactly 1 GiB (1,073,741,824 bytes). Direct session writers
also pass these guards; direct budget changes/deletion are rejected. The service
locks this row in a short transaction before checking/replaying/creating intents.
No transaction remains open while receiving a workbook. The reserve excludes
completed job files and is not a memory or total host-disk budget.

Terminal status alone does not release capacity: retain `reservedBytes` until
temporary-byte cleanup is confirmed. Deleting a reserved session (including
through owner deletion) is blocked rather than orphaning its files. Progress
cannot regress, metadata and terminal receipts cannot change, and no job foreign
key can erase the completion identifier when a completed job is deleted.
Creation timestamps come from PostgreSQL at millisecond precision; both deadline
fields are set together rather than mixing Prisma's client timestamp with a
database default. The rollback refuses any retained intents and preserves history.

The guarded PostgreSQL test upgrades a populated prior schema and rehearses
rollback without changing existing users, jobs or administrator choices. Real
transactions prove simultaneous same/distinct-intent behavior across two clients,
exact global capacity/+1 rejection, immutable metadata, reservation rollback,
terminal cleanup accounting and replay from a fresh Node process. Raising the
database capacity CHECK makes the direct-writer regression fail. Legacy HTTP/disk
and workbook regressions remain intact.

### Completed authenticated session lifecycle prerequisite

The API now exposes authenticated `POST /upload-sessions`,
`GET /upload-sessions/:id` and `DELETE /upload-sessions/:id`. Every lookup is
scoped to the verified JWT owner; a foreign owner receives the same 404 as an
unknown ID. Responses are built from an explicit metadata allowlist: they omit
owner IDs, reservation counters, Prisma timestamps and all filesystem paths.
The stable job identifier is exposed as `jobId` only for completed receipts.
Busy and global-capacity 409 responses include `Retry-After: 1`; storage
failures remain 503, not retryable busy responses.

Cancellation acquires the existing upload admission slot, is idempotent and
never changes or removes a completed job/receipt. An unfinished session becomes
`CANCELLED` (or `EXPIRED` at its fixed deadline) before temporary cleanup; its
reservation is released only after the session's ID-keyed directory is absent
or a marker-verified private directory has been safely removed. Unsafe paths,
symlinks, foreign markers, special files, excessive nesting and excessive entry
counts stop cleanup, log a visible failure and retain reservation accounting.
Startup and 60-second cleanup sweeps process at most 20 sessions per pass and
use the shared admission slot. A process-local cursor over immutable
`(expiresAt, id)` keys advances even when cleanup fails and wraps to the first
page at the end, so persistent failures cannot monopolize every batch or starve
later expired sessions. Each pass still selects at most 20 candidates.
Nonexpired reservations are never evicted to free capacity. Completed rows and
their stable job IDs remain as logical receipts.

The owner marker is a private internal storage contract for the chunk writer:
`ensureSessionStorage` looks up the validated requested UUID, then uses
the persisted canonical `session.id` for its directory and marker. This keeps
uppercase UUID inputs aligned with cancellation/sweeper paths. It does not
expose a path to the API.
Status rechecks the current 1-50 MiB administrator limit for active sessions
and returns `UPLOAD_LIMIT_CHANGED`/413 with corrective guidance. The same
service check is used by chunk reception and is available to future completion.
Existing
settings, default ceiling, legacy multipart path and job/translation behavior
remain unchanged.

Real authenticated HTTP and disposable PostgreSQL tests verify status/create/
cancel ownership, response allowlisting, repeat cancellation, completed-job
preservation, capacity and busy retry headers, lowered limits, cancellation/
creation races, startup-after-restart expiry, bounded cleanup, symlink/foreign
path refusal and reservation retention after cleanup failure. A real filesystem
case with 20 older failing directories proves a later healthy expired session
is cleaned on a subsequent bounded pass while failed reservations and foreign
data remain; the uppercase-UUID case proves cancellation removes the canonical
directory before releasing its reservation. Both regressions failed before the
fixes. Task 5 chunk reception is complete; task 6 exactly-once completion,
browser recovery and the separate 200 MiB safety certification remain pending.
The owner-deletion applicability
audit is complete: PostgreSQL blocks cascading deletion while reserved bytes
exist, and neither existing admin controller has an account-deletion route, so
HTTP conflict mapping is not applicable yet. If a route is introduced, it must
surface that block explicitly. No new destructive account-delete endpoint was
added.

Source: [upload-session service](../apps/api/src/modules/file-upload/upload-session.service.ts),
[lifecycle controller](../apps/api/src/modules/file-upload/upload-session.controller.ts),
and [disposable HTTP/PostgreSQL lifecycle tests](../apps/api/test/upload-session-http.test.cjs).

Source: [PostgreSQL 16 row locking](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS).
Existing Prisma 7 transaction patterns and generated types are retained.

### Raw chunk reception (Task 5)

The earlier draft was paused on 2026-11-16 at 00:14 JST. The subsequent review
addresses its storage accounting, error handling, parser and proxy issues. This
slice does not implement session completion or browser recovery; the full task
status and verification are in [the tracker](../../tasks/todo-v6.md).

The authenticated `PUT /upload-sessions/:id/chunks/:index` route accepts only
raw `application/octet-stream`. The chunk index is a canonical non-negative
decimal integer; only the next unacknowledged chunk or a matching acknowledged
replay is accepted. Expected byte length comes from immutable session metadata:
1,048,576 bytes except for the exact shorter final chunk. The streamed bytes
are SHA-256 checked against the ordered creation manifest. Type, length, order,
hash, ownership, expiry and current administrator-limit failures have explicit
machine-readable responses. The final accepted chunk leaves the session in
`RECEIVING`; this task does not validate/finalize a workbook, create a job, or
queue a notification.

Nest's default JSON parser would otherwise consume a request before guards run.
Bootstrap disables only Nest's automatic parser installation and installs
targeted JSON/urlencoded middleware that bypasses parsing for the raw chunk
route; all other requests retain their existing JSON/urlencoded parsers and
limits. This intentionally does not enable Nest `rawBody`, which buffers the
entire request. The controller's JWT guard runs before the service acquires the
shared legacy/session admission slot or reads the body. `UPLOAD_BUSY` retains
409 and `Retry-After: 1`. The chunk-specific nginx location caps the raw body
at 1 MiB, accepts the optional trailing slash and uses HTTP/1.1 with request
buffering disabled, so even transfer-encoded requests can receive an early
auth/admission response.

Reception holds one expected incoming chunk in memory and writes no duplicate
temporary chunk file. Prefix and replay verification may use another bounded
chunk-sized buffer. It does not buffer the workbook, encode chunk data as
JSON/base64, follow client filenames, or retry the legacy multipart endpoint.
Stale chunk files from the earlier draft are removed safely. Before append/replay it
reloads persisted progress. The assembled spool's committed prefix is checked
for exact length and each stored hash; a missing, short or corrupt committed
prefix is an explicit storage/integrity failure. A tail beyond the fresh
database offset is truncated only after that offset is confirmed from
PostgreSQL. Matching replay also checks the incoming digest and compares its
actual bytes with the acknowledged spool range, so it cannot append twice.

The chunk is acknowledged only after appended spool bytes are synced and a
short PostgreSQL transaction commits progress.
The transaction rechecks status, expiry, progress and current settings while
conditionally advancing the offset. No transaction or settings lock spans
slow client I/O. If a progress commit fails or its outcome is uncertain, the
spool tail is retained until a later fresh read determines whether PostgreSQL
committed it; a committed prefix is never truncated using stale process state.
The admission lease remains held until request reception, writing and commit
settle, including disconnects. Directory sync is attempted where the
platform supports it. Linux uses 0700 directories/0600 files; Windows relies
on the local account's filesystem ACLs. These process-crash tests do not promise
host power-loss durability or an atomic transaction spanning filesystem and
PostgreSQL.

Authenticated HTTP tests on the host and Node 22 Linux use disposable PostgreSQL
and terminate owned API workers during reception, after a synced second chunk
but before its progress commit, and after commit before response. They verify
the committed prefix and safe retry. A PostgreSQL row lock deterministically
crosses expiry between the transaction's check and update. Injected sync
failure verifies explicit storage errors and handle closure. Tests also cover
exact, short and oversized transfer-encoded chunks, the absence of duplicate
chunk files, and real-nginx early responses and size boundaries with and
without a trailing slash. These tests do not establish host power-loss
durability.

Sources: [Nest raw-body FAQ](https://docs.nestjs.com/faq/raw-body),
[Nest middleware](https://docs.nestjs.com/middleware),
[Node streams](https://nodejs.org/api/stream.html), [Node filesystem](https://nodejs.org/api/fs.html),
[request body parser helper](../apps/api/src/common/request-body-parsers.ts),
[chunk endpoint](../apps/api/src/modules/file-upload/upload-session.controller.ts),
[chunk storage](../apps/api/src/modules/file-upload/upload-session.service.ts),
and [nginx chunk location](../apps/web/nginx.conf).

### Remaining safety gates

Keep the current ceiling until the remaining safeguards and tests pass:

1. Complete stable-ID promotion and crash reconciliation during durable session
   completion. Private disk reception and interrupted-receive cleanup are
   implemented, but source-file promotion and database publication are not one
   atomic transaction.
2. Bound expensive whole-workbook operations across uploads, sheet discovery,
   translation parsing/patching and table previews, not only translation
   starts. Acquire capacity before a whole-file read. Queued work must retain
   paths/metadata, not loaded buffers. Release capacity after work settles,
   including cancellation; a client disconnect must not release a still-running
   parser's reservation. Keep the administrator's 1-5 translation setting.
3. Preserve all ZIP/CRC/package-output checks. Bound entry-verification work
   without relying on JSZip internals or removing CRC validation. Do not raise
   the 250 MiB expansion limit merely to accept more worksheet data.
4. Authorized preview/download responses now stream from open files, retaining
   owner checks, filenames and failure reporting. The table preview still parses
   the whole workbook: avoid that for its bounded window or place the parser
   inside the same capacity budget.
5. Increase the settings range and transport ceiling to 200 MiB only after
   the above work is verified. Keep the default at 50 and do not rewrite
   administrator choices. Set the upload proxy envelope to 201 MiB; retain
   smaller limits for unrelated JSON routes. Update both preview adapters,
   settings descriptions and Japanese/Chinese strings together. Keep legacy
   JSON endpoints bounded; large workbooks use the authenticated multipart/job
   workflow, not JSON arrays.
6. Measure API RSS/heap, temporary disk use, processing time and browser/Wasm
   memory with media-heavy and XML-heavy fixtures. Set the deployment resource
   budget from those measurements, leaving headroom for PostgreSQL, nginx and
   Ollama. A container memory limit is a last defense, not an admission policy.
   If the pinned preview cannot import a valid 200 MiB workbook reliably, do
   not advertise full preview support or silently turn an import failure into
   success; keep the V6 end-to-end task open.

Disk spooling plus bounded processing is preferred to just raising constants
or requiring operators to guess a larger heap. No new upload framework,
external storage service, upstream editor fork or public deployment is needed.

## Verification gates

- Actual multipart files at 1, 50 and 200 MiB are accepted under matching
  administrator settings; one extra file byte is rejected. Verify both
  Content-Length and chunked requests, multipart overhead, malformed files,
  authentication and ownership.
- Lower administrator settings still reject larger files; existing database
  values and the default remain unchanged after migrations.
- Excess concurrent receives/parsers are bounded before allocating file
  buffers. Abort, parser error, disk failure, cancellation and restart do not
  leak capacity or temporary files. Polling and health checks remain responsive.
- ZIP bombs, bad CRCs, unsafe entries and corrupt output remain rejected.
  Selected-sheet translation and preservation tests still pass.
- Test source and translated previews, real browser import, downloads and
  local/private-tailnet paths. A mocked iframe does not certify ibisOffice
  import or a phone's WebGPU resources.
- The proxy prerequisite test uses the real checked-in nginx config with an
  isolated streaming HTTP upstream, not the live database. It verifies complete
  50 MiB multipart forwarding, rejects envelopes over 51 MiB, and keeps other
  API routes at 1 MiB. It does not certify 200 MiB parsing.
