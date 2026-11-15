# Identity and base contract (V6, before storage migration)

**Status:** Implemented validation contract and regression coverage for existing
APIs only. This document does not claim the account/base storage migration or
the acronym-only base UI has shipped.

## Current API and storage contract

The current API is unversioned. Treat the following behavior as its existing
v1 compatibility surface; do not rename, remove, or repurpose these fields in
place.

| Surface | Current contract |
|---|---|
| `POST /auth/login` | Accepts `{ username, password }`. Local authentication looks up the exact stored username; it does not trim or case-fold credentials. |
| `POST /admin/users` | Accepts `username`, `email`, `baseId`, and `password`, plus optional legacy `gid` and `fullName`. A legacy client can omit `fullName` when it supplies a GID. Omit `gid` to leave it null; if present it must be a non-empty string. |
| `PATCH /admin/users/:id` | Accepts partial updates to `gid`, `username`, `fullName`, `email`, `baseId`, and `enabled`. An explicit username change updates the LOCAL identity subject and revokes existing sessions; an unrelated edit does not rename the login. A supplied GID must be a non-empty string; omit it to leave it unchanged. |
| Profile REST and GraphQL | Keep the existing `fullName` and `email` fields. `fullName` remains nullable for old rows and clients. |
| Base management and assignment | Current base records have UUID `id`, acronym-like `code`, and separate required `name`. User assignments reference the UUID through nullable `User.baseId`. |

### Input normalization, lengths, and uniqueness

- **Username:** required on administrator create/update; trim leading and
  trailing ECMAScript whitespace, reject empty values and C0/C1 control
  characters, preserve internal whitespace and casing, and count a maximum of
  100 JavaScript UTF-16 code units (so a supplementary character counts as two).
  The login and uniqueness comparison are
  case-sensitive. PostgreSQL's existing unique index is on `User.username`
  exactly; no Unicode normalization is applied.
- **Legacy GID:** remains nullable and distinct from `username`. When supplied,
  trim leading/trailing whitespace, reject empty values and C0/C1 control
  characters, and allow at most 64 JavaScript UTF-16 code units. The database
  enforces uniqueness on `lower(trim(gid))` for non-null values, so GIDs
  differing only by case or surrounding ASCII spaces collide. The login
  username is not automatically copied into or replaced by `gid`.
- **Full name:** trim leading/trailing whitespace; blank input becomes `null`.
  The maximum is 50 Unicode code points, inclusive, not UTF-16 code units or
  user-perceived grapheme clusters. This counts supplementary characters such
  as `𠮷` as one code point. A PATCH that omits `fullName` leaves it unchanged.
  Existing rows may retain a null full name.
- **Email:** existing API behavior is retained: trim, lowercase, validate with
  the current basic email format, cap input at 254 JavaScript string units,
  and check duplicates without regard to case.
- **Base acronym (`code`):** trim, uppercase, then accept at most 32 characters
  matching `[A-Z0-9_-]+`. The database has a unique index on `upper(code)`;
  case variants collide. `code` is mutable today. Updating it leaves the
  UUID `Base.id` and every `User.baseId` assignment unchanged. A base assigned
  to users cannot be deleted (`ON DELETE RESTRICT`).

Administrator API validation reports invalid input as HTTP 400 and a
uniqueness conflict as HTTP 409. Storage constraints remain necessary for
concurrent writes; this slice tests the service-level conflict mapping and
checks the existing PostgreSQL index definitions, but does not run against a
database.

## Legacy data and authentication compatibility

- Keep `User.id` as the account identifier. Do not overwrite or derive
  `username` from `gid`, `email`, `fullName`, or a provider claim.
- Keep `gid` and nullable `fullName` columns and values until a later
  expand/backfill/cutover/contract migration. Do not infer missing names or
  truncate stored values.
- Keep `Base.id` and `User.baseId` as UUIDs for current API clients and
  foreign-key relationships. No acronym primary-key conversion is included
  here.
- Local identities continue to use `(LOCAL, username)` as their subject.
  Username edits remain explicit administrator actions and invalidate old
  sessions.
- OIDC identity resolution continues to use `(KEYCLOAK, sub)`. The internal
  account username (often `keycloak-${sub}`) and `UserIdentity.subject` remain
  separate from mutable `preferred_username`; the provider username is
  refreshed without renaming the stored account. OIDC names continue to come
  from the existing `name`/`preferred_username` mapping. No provider claim is
  truncated or rejected by this slice.

## Forward migration requirements

The proposed **next-version shape** (a breaking contract, not implemented in
this task) is:

- Keep `username` as the one local login identifier; it may be a GID-like
  identifier or a chosen name. Keep a separate `fullName` (Japanese or
  English), `email`, and credential. The old `gid` value is legacy metadata,
  not an implicit source for changing a login.
- Require `fullName` for newly created local accounts only on a new,
  explicitly versioned contract. Existing rows and OIDC-created rows remain
  readable without it unless product chooses a separate OIDC policy.
- Use `POST /v2/admin/users` with `{ username, fullName, email,
  baseAcronym, password }`; use partial `PATCH /v2/admin/users/:id` with
  `username`, `fullName`, `email`, `baseAcronym`, and/or `enabled`. Responses
  retain stable user `id` and return `username`, nullable legacy-compatible
  `fullName`, `email`, `baseAcronym`, and `enabled`. The current unversioned
  endpoint retains its existing fields during migration.
- Expose one base `acronym` and use `Base.acronym` as the primary key in the
  target storage contract; do not expose separate `code` and `name` fields on
  the v2 base contract. The v2 assignment field is `baseAcronym`. The current
  UUID and unversioned `baseId` API remain available during migration.
- Use `/v2/bases` with `{ acronym }` for create and acronym-only base
  representations. Duplicate acronyms return HTTP 409; invalid syntax/length
  returns HTTP 400; deletion of an assigned base remains restricted. Acronym
  edits must update all dependent assignments atomically.
- Keep current exact-case, trim-on-admin-write username rules unless the
  collision inventory and a confirmed product decision authorize a different
  comparison rule. The current UI also uses UTF-16 code units for username and
  GID limits, matching the API; only `fullName` uses a Unicode code-point
  count.

Migration sequence:

1. Inventory all existing usernames, GIDs, acronyms, full names, and dependent
   foreign keys. Report collisions under the *confirmed* comparison rules;
   never silently choose or rename an account.
2. Expand storage with nullable candidate fields/mapping while retaining
   `User.id`, `User.username`, `User.gid`, `User.fullName`, `Base.id`,
   `Base.code`, `Base.name`, and `User.baseId`. Backfill by stable IDs and
   preserve old values. No truncation or inferred login rename.
3. Dual-read/write the candidate identity/base fields and validate parity.
   Serve the acronym-based contract at a new version while current clients
   continue using v1 UUID-based assignment.
4. Publish a migration guide and deprecation notice before retiring the
   current unversioned routes. For external consumers, provide at least six
   months between the deprecation/sunset announcement and removal; emit
   `Deprecation`/`Sunset` signals, monitor use per consumer, and extend the
   runway if meaningful traffic remains. Keep old IDs/fields until consumers
   have moved and the announced sunset has passed. Remove old columns and
   foreign keys only in a separate contract step.

The user confirmed that acronym edits should update assigned users. Do not make
the acronym a mutable primary key without testing atomic updates to every
dependent foreign key. Until that migration exists, the current UUID remains
the stable relationship key and `code` remains the current editable acronym.

## Decisions for implementation

These are deliberately not changed by this slice:

1. Retain the current exact-case, no-normalization username behavior so
   existing logins remain unchanged.
2. Allow acronym edits and update assigned users atomically, as confirmed by
   the user.
3. Require a full name for newly created local accounts without removing
   compatibility for older requests.
4. Enforce the 50-code-point full-name limit for OIDC claims. The user chose
   to reject sign-in when a provider name exceeds the limit, rather than
   truncate it or silently omit it.
