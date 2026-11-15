# V6 factory acronym primary key

Date: 2026-11-15. Scope: **base primary-key compatibility slice only**.
The account/GID migration and acronym-only UI/versioned API remain pending.

## Decision and exact mapping

Use `Base.code` as the PostgreSQL primary key while keeping `Base.id` as a
unique, immutable UUID compatibility key. This avoids rewriting every user's
assignment and changing existing API clients. An acronym edit changes the
same base row, so all assigned users immediately resolve the new acronym
without changing their `baseId`, identity, timestamps or session version.

| Field / object | Before | After |
|---|---|---|
| `Base.code` | `TEXT NOT NULL`, unique `Base_code_key` | `TEXT NOT NULL`, primary key `Base_pkey` |
| `Base.id` | `TEXT NOT NULL`, primary key `Base_pkey`, Prisma `@default(uuid())` | Same values/type/default, unique index `Base_id_key`, immutable-update trigger |
| `User.baseId` | Nullable TEXT FK to `Base.id` | Same values/type and target; FK rebound to the unique UUID index |
| `User_baseId_fkey` | `ON DELETE RESTRICT ON UPDATE CASCADE` | Same actions; validated separately after the atomic key swap |
| `Base_code_case_insensitive_key` | Unique `upper(code)` expression index | Retained unchanged |
| Accounts and other references | `User.id`, usernames, legacy GIDs, nullable full names, credentials, identity links, jobs, vocabulary, notifications, audits | Unchanged |

Prisma mapping (no `@db.Uuid` conversion, no `@map` column rename):

```prisma
model Base {
  id        String   @unique(map: "Base_id_key") @default(uuid())
  code      String   @id(map: "Base_pkey")
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users     User[]
}
// In User:
// baseId String?
// base Base? @relation(fields: [baseId], references: [id], onDelete: Restrict)
```

Prisma supports relations to unique non-primary fields. Its generated clients
can select/update a base by either `id` or `code`; old generated clients continue
using UUID `id`. The SQL trigger and case-insensitive expression index are custom
objects, documented rather than represented as unsupported Prisma attributes.
`uuid()` remains a Prisma-side default, not a new PostgreSQL default.
Existing TEXT UUID values are never recast, regenerated or inferred.

Existing `/admin/bases/:id`, base response `{ id, code, name }`, administrator
`baseId` assignments/search and authentication/profile contracts remain unchanged.
API writes still trim/uppercase codes and accept `[A-Z0-9_-]+`, maximum 32
characters. Existing lowercase acronyms within that syntax are preserved, not
silently uppercased; case-insensitive uniqueness still rejects colliding variants.
The migration rejects malformed historical codes for owner-approved remediation.
It never truncates, renames, nulls, resets, backfills or deletes a record.
Database UUID updates are now rejected, including by direct SQL; current API
clients already cannot edit `id`. Rollback removes that new trigger.

## Deployment gate and blast radius

Before deployment, confirm the downtime budget and PostgreSQL version
and catalogue size, inventory dependent references, and prove a backup restores
to a fresh instance. This test is a populated migration rehearsal, not evidence
of production backup recoverability or production RPO/RTO.

Read-only preflight on an approved target:

```sql
-- Counts only; inspect sensitive rows separately through authorized procedures.
SELECT count(*) AS invalid_acronyms FROM "Base"
WHERE "code" IS NULL OR char_length("code") NOT BETWEEN 1 AND 32
   OR "code" !~ '^[A-Za-z0-9_-]+$';
SELECT count(*) AS conflicting_groups FROM (
  SELECT upper("code") FROM "Base" GROUP BY upper("code") HAVING count(*) > 1
) conflicts;
SELECT conrelid::regclass AS dependent_table, conname,
       convalidated, pg_get_constraintdef(oid)
FROM pg_constraint WHERE confrelid = '"Base"'::regclass AND contype = 'f';
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Base';
SELECT count(*) AS bases FROM "Base";
```

The migration repeats preflight inside its locks to close the check/write race.
It requires the prior `Base.id` primary key, a validated UUID assignment FK with
the expected actions, and valid exact/case-insensitive code indexes. Unknown
inbound FKs fail closed: an operator must plan their compatibility before retrying.
No `DROP ... CASCADE` is used.

1. `20261115183000_base_primary_key_v6`: one transaction. Acquire exclusive locks
   on Base and User, preflight, create the UUID unique index, replace the primary
   key using the existing exact-code index, rebind the FK `NOT VALID`, add UUID
   immutability and insert the changelog. Any statement error rolls back the entire
   cutover, including indexes, trigger and changelog.
2. `20261115183100_validate_base_compatibility_fk_v6`: a separate transaction
   validates the FK with `SHARE UPDATE EXCLUSIVE` on User and a referenced-table
   lock that permits normal writes. The full User scan is not under the cutover's
   exclusive locks. `NOT VALID` already enforces new writes and deletes.
   Historical validity follows from the validated old FK, unchanged values and
   both tables being locked throughout rebinding.

**Atomicity is per phase, not across the whole two-migration deployment.**
If phase 2 times out, phase 1 stays committed and the FK remains enforced but
not catalogue-validated. Do not declare deployment complete until validation
passes. Retry validation; do not undo successful phase 1 merely to rerun it.

Cutover/rollback: `lock_timeout=1s`, `statement_timeout=15s` per statement.
Validation: `lock_timeout=1s`, `statement_timeout=60s`. All settings are local.
These are not total-transaction deadlines. The small Base catalogue preflight
and UUID index build run under the exclusive Base lock; there is no User backfill
or scan there. Measure this on a production-sized restore before approval.
For an unusually large Base catalogue, stop and design a separately prepared
concurrent index build rather than raising budgets blindly. Lock waits can
briefly queue app traffic; this is **not a zero-downtime guarantee**.
Long readers, maintenance and other DDL can cause a safe timeout.

Apply both migrations with the normal `prisma migrate deploy` process only
after operator approval. Prisma 7.10.1 may mask a transactional failure as
`current transaction is aborted` rather than the original PostgreSQL error.
The tests reproduce this behavior. Verify key/FK/index state and the migration
history, then use `prisma migrate resolve --rolled-back <failed-migration>`
before retrying the unchanged failed migration after contention/remediation
is resolved. Never mark a failed migration applied. Never resolve successful
phase 1 as rolled back when only phase 2 failed.

## Reversal

Operator-only `rollback.sql` beside phase 1 restores the original UUID primary
key and exact-code unique index, removes the immutability trigger and rebinds the
UUID FK. It retains all current acronym values, data and published history.
Run phase 2's validation SQL separately afterwards; its lock/error behavior
is the same as forward validation. Both old and new generated clients remain
runtime-compatible after reversal, but Prisma's declared schema/history will
then intentionally differ from the restored database.

Coordinate the reversal with deployment history; do not edit an applied migration,
reset the database or pretend the reverted schema still matches Prisma. For
permanent reversal, publish a new forward migration and restore the prior Prisma
mapping in a coordinated change. For reapplication, publish a new migration;
do not rerun the already-applied historical migration. Keep historical changelog
entries. Current APIs remain UUID-based throughout.

## Repeatable evidence

From the repository root (requires **already installed** `postgres:16-alpine`):

```powershell
Set-Location project/apps/api
$env:V6_DISPOSABLE_POSTGRES = "true"
npm run test:base-primary-key-v6
```

The test never takes a database URL as its target. It creates a uniquely labelled
disposable container with `--pull=never`, an anonymous volume and random
localhost-only port, checks ownership before removing only that container/volume,
and restores process environment and removes scratch clients/migrations.
No Compose invocation, external installation, credentials from the real DB,
truncate or reset is involved.

Verified on PostgreSQL 16 / Prisma 7.10.1:

- All prior migrations deployed before inserting multiple bases, assigned users,
  legacy GID/full-name/email/password and LOCAL/KEYCLOAK identities.
- Value-equivalent row snapshots around forward migration and reversal;
  catalogue checks prove the actual PK, FK target/actions and validation state.
- A separately generated prior-schema Prisma client operates before/after
  upgrade; the new client operates before/after rollback.
- UUID HTTP management, authenticated/admin guards, legacy account creation,
  assignment, search and acronym rename retain the expected response shape.
- Existing local login and linked OIDC exchange/session remain valid; OIDC uses
  a simulated verified claim boundary, **not a live Keycloak deployment**.
- Collision/invalid-value/unknown-FK preflight failure, lock timeout, injected late
  SQL failure, separately blocked validation, real failed Prisma deploy,
  `resolve --rolled-back` and retry all preserve their documented phase state.
- Duplicate create/rename errors map to 409; unique indexes survive cutover and
  rollback; direct UUID updates fail after cutover. Concurrent duplicate creation
  has one winner. An overlapping assignment/delete waits then rejects deletion.
- Database and built-in changelog values match exactly.

Additional verification: Prisma validate, API TypeScript compilation with
`--incremental false` (preserving pre-existing `tsconfig.tsbuildinfo`), web build,
and the API regression suite. The broad suite observed 139 passing tests,
2 failures in unchanged test fixtures (system-info omits the settings provider;
translation-concurrency's TS loader cannot resolve the settings module), and
3 opt-in tests skipped (live Keycloak and unrelated V2/V3 PostgreSQL tests).
The full-name and base V6 PostgreSQL drills both passed. These unrelated failures
were not hidden or fixed in this slice.
The final focused account/base/session/JWKS regression selection passed all
56 tests with no skips. A temporary inversion of the UUID-immutability condition
made the PostgreSQL drill fail at its expected-rejection assertion; restoring
the condition restored the passing drill. No mutation remains in the migration.

Sources:
[Prisma unique-field relations](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations/one-to-many-relations),
[PostgreSQL ALTER TABLE / FK validation and index attachment](https://www.postgresql.org/docs/16/sql-altertable.html).
