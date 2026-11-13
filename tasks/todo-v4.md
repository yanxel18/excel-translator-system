# Excel Translator Todo — Version 4

Created: 2026-11-13. Status: Planned.
Plan: [plan-v4.md](plan-v4.md). Previous version: [todo-v3.md](todo-v3.md).

Keep authentication, permissions, saved data, translation workflows, localization, and responsive behavior intact.

## Application shell

- [x] **V4-01 — Redesign navigation and profile controls (M)**
  - Use a Lucide workspace icon and a compact, consistent circular navigation treatment.
  - Put the circular profile avatar at the lower left of the navigation rail; an upward control expands account details and actions. Use the supplied image as inspiration, not copied branding or imagery.
  - Acceptance: navigation, profile, administrator settings, sign-out, theme, loading/error states, keyboard access, and mobile navigation continue to work.
  - Verify: focused browser checks for collapse/expand, navigation, account actions, both themes, and 320px and desktop layouts.
  - Dependencies: none. Files: app-shell components, related styles and tests.
  - Evidence: browser checks cover profile details, actions and failures, admin access, keyboard use, themes, and desktop/mobile navigation.

- [x] **V4-02 — Remove duplicate language settings (S)**
  - Retain one accessible, persistent three-language selector and remove the duplicate settings entry that serves only the same purpose.
  - Acceptance: English, Japanese, and Chinese remain selectable and persistent without duplicate controls or dead menu actions.
  - Verify: browser checks for each locale, persistence, keyboard access, and mobile placement.
  - Dependencies: coordinate with V4-01. Files: app-shell preferences and tests.
  - Evidence: browser checks cover the globe selector, all three locales, persistence, dismissal, and absence of the duplicate menu entry.

## Visual refinement

- [ ] **V4-03 — Refresh the application visual system (M)**
  - Improve hierarchy, density, surfaces, spacing, and cohesive controls across the application, using the reference's restrained rounded surfaces and circular affordances while retaining the product's own identity.
  - Acceptance: workspace and shared surfaces are cohesive in light/dark themes, legible, and responsive without changing functionality.
  - Verify: desktop/mobile browser screenshots and layout/accessibility checks; web build and typecheck.
  - Dependencies: coordinate styles with V4-01. Files: shared styles, workspace presentation, focused tests.

- [ ] **V4-04 — Compact notifications and separate footer (M)**
  - Make the notification popover slim and compact while preserving all notification interactions; add clear spacing above the footer.
  - Acceptance: list, loading, empty, error, and navigation states remain usable; footer does not touch preceding content on short or long pages.
  - Verify: browser checks with long notification text, desktop/mobile sizes, and footer spacing.
  - Dependencies: coordinate shared styles with V4-01. Files: notification preview, shell styles, tests.

## History and vocabulary

- [ ] **V4-05 — Compact history page-size control (S)**
  - Place a compact two-digit-capable Rows per page control to the right of the pagination's next arrow.
  - Acceptance: existing options, URL state, pagination behavior, localization, and narrow-screen usability remain intact.
  - Verify: browser checks for position, width, page-size changes, URL restoration, and mobile layout.
  - Dependencies: none. Files: history page, scoped styles, tests.

- [ ] **V4-06 — Separate vocabulary actions (S)**
  - Keep the edit pencil with the group name and move Add term and Delete to the opposite right side.
  - Acceptance: all actions retain accessible names, behavior, confirmation, and reachability for long names and narrow screens.
  - Verify: browser checks for alignment, editing, adding, deletion, keyboard access, and mobile.
  - Dependencies: none. Files: vocabulary page, scoped styles, tests.

## Integration

- [ ] **V4-07 — Verify the complete redesign (M)**
  - Verify the combined V4 experience, including desktop/mobile, both themes, localization, account access, session expiry, and existing translation workflows.
  - Acceptance: all V4 tasks pass, the built-in and database Changelog entries agree, and no existing functionality is lost.
  - Verify: relevant browser regressions, web typecheck/build, and migration/Changelog parity.
  - Dependencies: V4-01–V4-06.
