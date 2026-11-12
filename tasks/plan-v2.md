# Version 2 implementation plan

Created: 2026-11-12 (Asia/Tokyo)
Status: Planned. This document does not indicate that the features are implemented.
Task tracker: [todo-v2.md](todo-v2.md). Version 1 remains in `plan.md` and `todo.md`.

## Intended experience

Workspace remains the default landing page. Profile becomes the personal home destination, with the user's identity, read-only details, a New translation button, and personal workbook statistics. The separate Dashboard destination is retired. Administrators manage users, bases, and authentication from a full System Settings page with a GitHub-style sidebar: grouped labels, icons, active sections, and clear page actions. Ordinary users cannot access management APIs or management sections.

History and management lists use server-side search, allowlisted column sorting, explicit filters, and numbered pagination. Page paths and query parameters survive refresh, browser back/forward, and direct links. Session expiry returns the user to Login automatically.

## Existing foundation to extend

- PostgreSQL/Prisma already defines User (including optional GID), UserIdentity, OidcSettings, TranslationJob, and related workbook tables.
- Local password authentication, Keycloak verification, and an administrator guard already exist. Review their current authority source before extending management access.
- OIDC settings are already persisted; extend this model and existing settings flow rather than introduce a competing configuration store.
- Profile already has an Overview dashboard and Account details with explicit Edit info mode. Reuse these components and data boundaries.
- The UI currently selects views in React state; the API client throws request failures into page content. These need routing and session handling changes.
- History is currently fixed at five rows. Existing user and job ownership restrictions must remain enforced.

## Assumptions and decisions to resolve

1. Registration initially means administrator-created internal accounts. Public self-registration is outside the initial scope unless requested.
2. GID is a business identifier, separate from the immutable UUID primary key. Before schema work, confirm its format, whether it is required, and uniqueness/case rules. Never derive administrative privilege from a user-editable GID.
3. Each user has one Base. Confirm whether legacy users may temporarily have no Base and whether OIDC claims can assign it. Do not silently assign an arbitrary Base during migration.
4. Initial Base codes are JTY, KKTY, CGTY, MSTY, PTY. Confirm display names, code editability, and whether inactive bases are needed.
5. Authentication modes are LOCAL, OIDC, HYBRID. LOCAL shows local sign-in; OIDC shows only the configured provider; HYBRID shows both. Confirm the desired initial mode and preserve current working access during migration.
6. Local password changes apply to local credentials. Keycloak passwords remain managed by Keycloak; the app must explain this distinction.
7. User details and personal statistics remain private to the owner, except authorized administrator account management. This release does not create public employee profiles.
8. Proposed list default is 10 rows, with 10/20/30/40/50 options. Confirm whether the intended options omit 40; the maximum stays 50.

These are implementation decisions to resolve in Task V2-01, not reasons to delay creating the plan.

## Database and migration design

| Model | Proposed change | Integrity and query rules |
| --- | --- | --- |
| Base (new) | UUID id, unique code, display name, optional enabled flag, createdAt/updatedAt | Seed five approved codes idempotently. Users reference Base.id. Restrict deletion while assigned; reassign explicitly first. |
| User (extend) | baseId, enabled, sessionVersion; finalize GID rules | Base FK indexed; preserve UUID and identities. Backfill existing users as enabled. Increment sessionVersion for disable/reset to revoke local sessions. |
| UserIdentity (existing) | Preserve provider/subject identity links | Keep provider+subject unique and userId indexed; never auto-link identities solely by matching email. |
| OidcSettings (extend) | Authentication mode plus validated existing issuer/realm/client/group fields | Single source of truth; migrate enabled flag consistently. Validate before enabling. Avoid storing a client secret for a public browser client. |
| ManagementAudit (new) | Actor, action, target type/id, redacted change summary, timestamp | Nullable actor FK with SetNull preserves history if actor is removed. Index actor/time and target/time. Never store passwords, tokens, or secrets. |
| TranslationJob (existing) | Add measured query indexes for history | Preserve owner FK. Evaluate owner+createdAt+id and owner+language pair+createdAt. Add only indexes supported by actual list queries. |

User search covers GID, username, email, Base code/name, and enabled state. Base search covers code/name. Use explicit status filters alongside text search. Case-insensitive substring search may require PostgreSQL pg_trgm indexes; assess extension availability and representative EXPLAIN plans before choosing them. Ordinary B-tree indexes alone do not solve arbitrary substring search. Preserve existing unique indexes and add no speculative index to every column.

Migrations must handle existing duplicate/missing GIDs before enforcing uniqueness, retain identity/job ownership, and define FK deletion behavior. Do not recreate published migrations. Existing foreign keys must remain valid after Base changes.

## Routes and API contracts

All routes use the configured application base path, for example `/excel-convert`.

| Browser route | Purpose |
| --- | --- |
| `/workspace` | Default authenticated destination |
| `/profile?tab=overview` / `/profile?tab=account` | Personal overview and account details |
| `/history?q=...&sourceLanguage=...&targetLanguage=...&sort=createdAt&direction=desc&page=1&pageSize=10` | Shareable history state |
| `/settings/users` / `/settings/users/new` / `/settings/users/:id` | Administrator user list, registration, detail |
| `/settings/bases` / `/settings/authentication` | Administrator Base and authentication management |

Preserve vocabulary, notification, and changelog destinations. Redirect old Dashboard links to Profile; default root and successful login go to Workspace. Configure deployment fallback for nested SPA URLs.

Proposed APIs: GET/POST `/admin/users`, GET/PATCH `/admin/users/:id`, dedicated password reset and enable/disable mutations; GET/POST `/admin/bases`, PATCH/DELETE `/admin/bases/:id`; extend existing OIDC configuration APIs rather than duplicate them; GET `/system/info` for backend year and safe public display metadata. Final endpoint names follow the repository's conventions.

List responses include `data`, `total`, `page`, and `pageSize`. Lists apply ownership/authorization before counting, filtering, and pagination. Use a stable id tie-breaker after the requested sort. GET is for reads; mutations use POST/PATCH/DELETE. Passwords, tokens, and private credentials never go in URLs. Decide how internal directory search terms may appear in browser history and access logs.

## UI and validation contract

- System Settings has icon navigation for Users, Bases, and Authentication. Lists have search, filters, sortable column headers, counts, pagination, loading, empty, error, and success states.
- User columns: GID, Username, Email address, Base / 拠点, Enabled, Actions. Detail supports editing approved fields and a distinct local-password action.
- Profile removes the heading/subtitle about managing attached details; its identity banner leads the page. Keep the upper-right Edit info action and read-only default. Add New translation leading to Workspace. Overview retains personal metrics/charts; Account shows personal identity/contact information.
- History search targets filenames and visible metadata, with explicit language filters and supported sort controls. Reset page to 1 on search/filter/page-size changes; debounce search and cancel stale requests.
- UI labels, validation, empty states, tabs, and actions support English, Japanese, and Chinese. Keyboard navigation, focus states, table header sort announcements, and mobile navigation must work.
- Server DTOs validate body, path, and query inputs; reject unknown properties where appropriate and allowlist sort fields, directions, enums, limits, and formats. Frontend mirrors constraints for immediate feedback; the server remains authoritative.
- Set a documented per-field limit/character matrix. Preserve valid Japanese/Chinese names and workbook filenames. Do not apply blanket ASCII filters or destructive text stripping. Trim identifiers where specified; never trim or silently alter passwords.
- Agree a password policy covering length, compromised/common-password checks where feasible, reasonable maximum length, and password-manager/paste support. Store password hashes only; rate-limit authentication/reset operations and redact logs.

## Security and operational boundaries

Disabled accounts cannot authenticate through either provider or continue using existing app sessions. Check persisted enabled state on protected requests, including validated OIDC identities. Local JWTs include a session version or equivalent revocation mechanism. Do not disable the last usable administrator or allow a user to escalate their own privileges.

On expired/invalid app credentials, a shared session handler clears state once, stops polling, preserves only a validated internal return route, and shows Login with a short expiry message. A 403 permission denial must not be treated as expiry. Provider login failures must not trigger recursive redirects. Apply the same behavior to previews/downloads and non-REST surfaces.

OIDC mode changes require validated configuration and a recovery procedure to prevent administrator lockout. Issuer/discovery endpoints need URL validation and controlled server-side fetching; do not turn settings validation into an unrestricted URL fetcher. Provider claims do not override a disabled local user. Audit management changes without sensitive values.

The footer reads `Translation System Taiyo Yuden Co. Ltd © {year}`. GET `/system/info` supplies the current year from the backend with an explicit calendar/timezone policy (proposed Asia/Tokyo); use caching and a defined unavailable-state strategy. Use original SVG artwork for favicon and header branding, with light/dark legibility and accessible labeling.

## Delivery sequence and completion

See the dependency-ordered tasks in [todo-v2.md](todo-v2.md). Each task is an implementation slice with acceptance and verification. Update this tracker only after evidence exists. Every completed project update must add synchronized Changelog migration and built-in history entries; record completed behavior, never claim the whole roadmap has shipped.

Before implementation, resolve the GID/Base/auth-mode decisions and the existing frontend TypeScript error reported at `WorkspacePage.tsx:70` (`SimpleGrid align`). Verify the current baseline rather than masking or suppressing errors. Final release requires migration rehearsal on existing data, access-control checks, session-expiry flows, direct URL refresh checks, and mobile/multilingual UI review.
