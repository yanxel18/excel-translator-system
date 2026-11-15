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

- [ ] Trace upload, proxy, workbook processing and preview limits; document memory
  implications and determine the safe 200 MB handling strategy.
- [ ] Support configurable limits from 1 to 200 MB end to end and update
  translations and deployment documentation. Test real boundaries and rejection.

## Integration checkpoint

- [ ] Run focused regression tests, API and web builds, and runtime checks.
- [ ] Rebuild and verify the local Compose services without removing volumes.
- [ ] Verify database and built-in changelog entries match each completed slice.
