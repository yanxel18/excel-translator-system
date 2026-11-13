# Excel Translator Todo — Version 5

Created: 2026-11-13. Status: In progress.
Plan: [plan-v5.md](plan-v5.md).

- [ ] **V5-01 — Keep the footer visible**
  - Acceptance: footer stays at the bottom during scrolling without covering content, controls, or focus at desktop and mobile sizes.
  - Verify: browser tests on short and long pages, small screens, and keyboard navigation.
  - Dependencies: none. Files: app shell layout, styles, focused tests.

- [x] **V5-02 — Make history easier to scan**
  - Acceptance: table headers remain visible on table scroll, localized labels do not render as vertical text, and history has no breadcrumbs or duplicate total badge.
  - Verify: browser tests with populated rows and English, Japanese, and Chinese labels on desktop and narrow screens.
  - Dependencies: none. Files: history page, styles, focused tests.
  - Evidence: browser checks cover sticky headers, localized labels, duplicate totals, and narrow-screen scrolling.

- [x] **V5-03 — Simplify history search**
  - Acceptance: remove source and target language controls while retaining their existing filtering and deep-link logic; offer a friendly localized Excel filename search placeholder.
  - Verify: search and language URL/request regression tests, pagination and refresh.
  - Dependencies: coordinate with V5-02. Files: history page, localization, focused tests.
  - Evidence: browser checks cover localized filename search and retained language-filter URL and request behavior.

- [x] **V5-04 — Make ancestor breadcrumbs navigable**
  - Acceptance: ancestor paths return to the correct page, including Workspace on Vocabulary; current location is not a misleading link; History has no breadcrumbs.
  - Verify: keyboard and pointer navigation, localized labels and routes.
  - Dependencies: coordinate with V5-02. Files: shared breadcrumbs/routing, focused tests.
  - Evidence: browser checks cover pointer and keyboard navigation, Japanese labels, and browser history.

- [ ] **V5-05 — Unify button theming**
  - Acceptance: comparable left navigation, avatar, theme and action controls share cohesive theme styling and typography, with distinguishable active, focus, disabled and destructive states in light and dark modes.
  - Verify: browser checks and screenshots at mobile and desktop widths in both themes.
  - Dependencies: coordinate with V5-01. Files: shared shell styles/components, focused tests.

- [ ] **V5-06 — Verify the combined redesign**
  - Acceptance: all preceding tasks pass together; translation, permissions, localization, session expiry and mobile controls remain functional; database and built-in changelog entries match.
  - Verify: integrated browser regression suite, web typecheck/build, changelog migration parity and visual review.
  - Dependencies: V5-01–V5-05.
