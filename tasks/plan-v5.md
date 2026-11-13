# Version 5 implementation plan

Created: 2026-11-13. Status: Complete; pull requests awaiting review.
Task tracker: [todo-v5.md](todo-v5.md).

## Objective and design contract

Make the translator easier to navigate and scan without changing translation behavior. The supplied screenshot is inspiration for compact circular controls and quiet, layered surfaces; retain the product's identity rather than copying its branding or artwork. Apply one coherent theme to comparable navigation, avatar, theme, and action buttons while retaining clear active, disabled, focus, and destructive states.

The UI/UX Pro Max dashboard guidance favors simple shapes, restrained effects, and accessible contrast. Its generic marketing layout and replacement palette do not fit this existing application and are not adopted. Tables remain semantic and horizontally scrollable where needed; sticky elements must not obscure content or keyboard focus.

## Capability map and decisions

| Capability | Responsibility | Dependencies |
|---|---|---|
| history | Sticky column headers; remove history breadcrumbs, language controls and duplicate total; improve localized filename search and header fit | none |
| breadcrumbs | Make navigable ancestor crumbs, including Workspace on vocabulary, work through existing routing | none |
| shell | Keep footer visible without hiding content; unify comparable button styling in both themes | none |
| integration | Verify the combined experience and synchronized changelog | history, breadcrumbs, shell |

Preserve existing URL parsing, query parameters, and backend filtering for source and target languages even though their history controls are hidden. Keep history sorting, search, pagination, refresh and row actions unchanged. History has no breadcrumb; other pages retain navigable ancestor crumbs and a non-link current location.

The footer remains visible at the viewport bottom while content scrolls, with reserved space and safe-area handling. Test short and long pages, small screens and zoom so the footer never covers controls. On narrow screens, prioritize reachability over a fixed pixel height.

## Verification and boundaries

- Add focused Playwright regressions for scroll behavior, all three locales, history filtering and deep links, ancestor navigation, both themes, keyboard focus, and 320px through desktop layouts.
- Run the web typecheck and production build and the relevant existing history, shell, vocabulary, translation and session-expiry regressions using an isolated development server.
- Apply each new changelog migration to a disposable database when feasible and compare it to its built-in entry. No schema change or real user data mutation is required.
- Preserve existing user changes, permissions, sessions, and translation workflows. Use existing React, Mantine and Lucide components; no new dependencies or copied screenshot assets.
- Each completed update gets a matching built-in changelog entry and a new historical migration. Submit reviewable branches and pull requests; do not merge on the user's behalf.

## Risks

| Risk | Mitigation |
|---|---|
| Footer hides content or conflicts with mobile controls | Reserve measured space and verify scrolling, focus, and small viewports. |
| Sticky table headings fail inside a nested scroll area | Test actual scrolling of the table and verify computed heading positions. |
| Hidden language filters break shared URLs | Retain and test existing query parsing and request behavior. |
| Parallel shell and breadcrumb edits conflict | Separate file ownership and integrate in a deterministic order. |
