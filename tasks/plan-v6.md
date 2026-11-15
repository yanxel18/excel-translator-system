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
| uploads | Adjustable upload ceiling of 200 MB | Existing upload and workbook validation |
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

## Risks

| Risk | Mitigation |
|---|---|
| Account and base key migration breaks sign-in or foreign keys | Exercise migrations and relations on a disposable database before applying; preserve data if feasible. |
| Large workbooks exhaust memory or fail in a hidden layer | Trace every size limit and processing cap; test actual uploads and document resource requirements. |
| Maintenance dates are misleading across time zones | Persist instants, validate ordering, show local zone and test boundaries. |
| Sidebar changes expose admin actions or hide them on mobile | Retain server authorization and verify each role at narrow and wide sizes. |
