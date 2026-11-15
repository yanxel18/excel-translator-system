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
| Tailscale Serve | Proxies the same web nginx at port 80; does not bypass the upload location or require Funnel. |
| Nest upload controller/module | Both set Multer's file ceiling to 50 MiB, one file, in-memory storage. Authentication precedes the file interceptor. |
| Upload service | Reads the persisted administrator limit, validates extension/size, opens the archive and verifies CRC32. |
| Job creation | Writes the whole source buffer to disk, discovers sheets, creates the database job and queued notification. Removes the source on failure. |
| Job details/settings | Read the whole source and reopen it to discover sheets. These operations are not controlled by the translation-start limit. |
| Translation start/retry | Global database admission limit of 1-5 workers. Workers read the whole source, extract text, translate bounded batches, patch the ZIP and validate the output. |
| OOXML archives | Reject more than 250 MiB declared uncompressed data, over 10,000 entries, or expansion above 200:1 for entries larger than 1 MiB. Reject unsupported ZIP formats, unsafe/duplicate paths and corrupt archives. |
| Output validation | Holds original/output buffers and opens both archives; compares package parts and parses output XML. |
| History table preview | SheetJS reads the whole file before slicing displayed rows to 50 and columns to 20. The display limit is not a parsing-memory limit. |
| ibis preview file endpoint | Owner-authorized endpoint reads the whole file and sends its bytes. |
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

## Selected implementation strategy

The user subsequently confirmed chunked transfers with a retained browser file
and automatic resume after refresh/browser restart for 24 hours, without normal
file reselection. The [resumable-upload specification](../../tasks/plan-v6.md)
is awaiting protocol approval. It adds durable upload-session progress, bounded
chunk replay and browser-storage failure handling to the strategy below.
Neither resumable uploads nor the 200 MB ceiling is enabled yet.

Keep the current ceiling until the following safeguards and tests pass:

1. Spool multipart uploads to a private, bounded temporary directory under the
   existing data storage. Enforce the configured limit while receiving, not
   only after a complete upload. Bound admitted receiving requests before
   storage allocation; reject excess work explicitly rather than queueing
   arbitrary bodies in memory. Clean up failed, oversized, aborted and
   interrupted uploads; use an atomic move for a successfully persisted job.
2. Bound expensive whole-workbook operations across uploads, sheet discovery,
   translation parsing/patching and table previews, not only translation
   starts. Acquire capacity before a whole-file read. Queued work must retain
   paths/metadata, not loaded buffers. Release capacity after work settles,
   including cancellation; a client disconnect must not release a still-running
   parser's reservation. Keep the administrator's 1-5 translation setting.
3. Preserve all ZIP/CRC/package-output checks. Bound entry-verification work
   without relying on JSZip internals or removing CRC validation. Do not raise
   the 250 MiB expansion limit merely to accept more worksheet data.
4. Stream authorized preview/download responses from files, retaining owner
   checks, filenames and failure reporting. For table previews, avoid parsing
   the whole workbook merely to display a bounded window, or place that parser
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
