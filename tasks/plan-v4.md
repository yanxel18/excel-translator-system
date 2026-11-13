# Version 4 implementation plan

Created: 2026-11-13. Status: Complete.
Task tracker: [todo-v4.md](todo-v4.md).

## Objective

Give the Excel Translator a cohesive, clearer, more compact interface while preserving its existing workflows, data, permissions, themes, and three-language support.

## Design contract

- **Reference:** The supplied CRM screenshot suggests a slim circular icon rail, circular avatar, compact controls, soft layered surfaces, and restrained contrast. It is inspiration only: do not copy proprietary branding, imagery, or exact layouts.
- **Identity:** Retain the application's name, blue accents, existing assets, and meaningful workbook iconography. Use a Lucide workspace icon for navigation rather than representing the workspace as a file.
- **Hierarchy:** Prioritize upload and translation status on Workspace; keep navigation secondary, notifications compact, and history/vocabulary controls aligned with their content.
- **Shell:** A circular avatar lives at the lower-left rail; an upward affordance reveals account details/actions. Keep the existing globe as the single language selector and retain theme and administrator access.
- **States:** Preserve loading, empty, error, permission, and session-expiry behavior. Do not invent profile photographs or require image uploads.
- **Responsive/accessibility:** At 320px and larger, controls must remain reachable without horizontal page overflow or content being obscured. Maintain visible focus, accessible icon names, keyboard navigation, adequate contrast, and both color schemes.
- **Avoid:** Decorative gradients, copied product assets, hidden functionality, oversized empty cards, and visual changes that disrupt existing flows.

## Capability map and delivery

| Capability | Responsibility | Dependencies |
|---|---|---|
| shell | Navigation, profile/avatar, theme, single language selector | none |
| visual | Shared visual refinement, footer spacing, compact notifications | coordinate with shell styles |
| pages | History pagination and vocabulary action layout | none |
| integration | Combined tests, build, and changelog verification | shell, visual, pages |

Implement independent capabilities in isolated worktrees, then integrate them in a deterministic order. Each completed update receives one synchronized user-readable database and built-in Changelog entry. Preserve published history.

## Implementation decisions

1. Interpret the reference avatar as a circular avatar in the requested lower-left navigation location; keep initials/default artwork, not uploaded portraits.
2. Keep the bottom-right globe language selector. The existing Settings modal only duplicates language selection, so remove that duplicate entry rather than removing language functionality.
3. Keep the existing history page-size options; compact the control without limiting values or changing pagination.
4. Treat the requested visual overhaul as a cohesive product-wide visual pass built on existing Mantine components and design tokens, not a feature or data-model rewrite.

## Verification

- Write focused browser regressions for each changed interaction, including desktop, mobile, long labels, and keyboard use.
- Run web typecheck and build; run relevant existing shell, history, vocabulary, notification, translation, and session-expiry browser tests.
- Compare screenshots and inspect runtime layout in both themes. Mock external APIs for isolated browser checks; do not modify real user data.
- Verify Changelog migration/fallback parity and apply new migrations to a disposable database when feasible.

## Risks

| Risk | Mitigation |
|---|---|
| Shared shell and style conflicts | Separate worktrees and coordinate file ownership before integration. |
| Compact controls obscure labels or actions | Verify long localized labels, focus, touch targets, and 320px layouts. |
| Visual redesign breaks existing workflows | Preserve existing handlers and run targeted plus integrated regressions. |
| Reference conflicts with product identity | Borrow layout principles only; keep existing branding and assets. |
