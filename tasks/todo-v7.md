# Version 7 requested tasks

These are new requests; unfinished Version 6 work remains in
[todo-v6.md](todo-v6.md). Check an item only after its acceptance criteria and
verification pass.

## Navigation

- [x] Show consistent, localized breadcrumbs on Translate File, History, and
  System Settings, including nested settings pages where applicable.
  - Acceptance: Breadcrumbs are visible, identify the current page, and use
    keyboard-accessible links for navigable ancestors without changing access
    permissions or existing routes.
  - Verify: Browser tests for the three pages, nested settings, supported
    languages, mobile widths, and keyboard navigation.

## History layout

- [x] Remove the separate Search Workbooks card and place the search input at
  the upper right of the Translation History table card.
  - Acceptance: Retain the search icon, accessible label and clear action,
    debounce, URL state, filters, and pagination reset; stack controls on
    narrow screens without horizontal page overflow.
  - Verify: Existing history search/filter tests and responsive browser checks.
- [x] Increase the space available to the history data table and move the
  Results value to the bottom left of the table card, before pagination.
  - Acceptance: Keep results, pagination, and page-size controls accessible
    in loading, empty, filtered, and populated states. Preserve table sorting,
    sticky headers, and usable scrolling on short and narrow viewports.
  - Verify: History scrolling and pagination tests with populated data at
    desktop and mobile viewport sizes.

## Dashboard and shared appearance

- [ ] Enlarge the Translation Status donut chart on the profile dashboard.
  - Acceptance: Make the chart more legible without clipping, hiding its
    labels, or breaking its accessible data representation on narrow screens.
  - Verify: Browser layout and accessibility checks in both themes and at
    narrow and wide viewport sizes.
- [ ] Apply the existing menu-button blue to system scrollbars.
  - Acceptance: Use shared theme tokens with legible thumb/track contrast in
    light and dark themes; retain usable native behavior and cover page and
    application scroll areas without causing layout overflow.
  - Verify: Inspect scrollable pages in supported browsers, themes, and
    viewport sizes; confirm keyboard and pointer scrolling still work.

## Browser tab and notifications

- [ ] Update the browser tab title when the current page, translation status,
  or unread notification state changes.
  - Acceptance: Titles identify the current page and relevant state, use the
    selected language, and restore the appropriate title after state changes.
    Do not expose workbook names or other private data in the title.
  - Verify: Browser tests for navigation, job state transitions, unread counts,
    locale changes, and sign-out.
- [ ] Signal completed and failed translations in the browser tab when
  possible.
  - Acceptance: Use a browser-supported title or favicon attention indicator;
    respect reduced-motion preferences, stop the indicator when the user
    returns or acknowledges it, and avoid endless or rapid flashing. Do not
    promise attention effects when the browser suspends or closes the page.
  - Verify: Browser tests for completion, failure, focus/visibility,
    acknowledgement, cleanup, and reduced motion.
  - Dependency: Dynamic tab title and notification state.
- [ ] Localize notification titles and messages dynamically using structured
  event templates and data.
  - Acceptance: Existing and new notifications render in the currently
    selected language in both the preview and full list; changing language
    updates visible notifications without losing read state or ownership.
    Preserve safe, readable fallback text for legacy or unknown events and
    avoid exposing or parsing sensitive data from arbitrary message strings.
  - Verify: API and browser tests for each event type, language switching,
    legacy records, deleted/missing job data, and access isolation.

## Background translation

- [ ] Verify started translations complete after sign-out and browser closure.
  - Current code starts an API-owned worker after the job is claimed; logout
    aborts an in-progress browser upload, not a started translation. This is
    code inspection, not yet a full end-to-end logout/close test.
  - Acceptance: A started job continues without the browser or session and is
    visible to its owner after signing in again; upload recovery remains
    separate. Do not weaken cancellation or ownership.
  - Verify: Isolated real API/database test starts a translation, signs out or
    closes the browser, waits for completion, and checks the persisted result
    and notification after reauthentication.
  - If the test reveals a gap, implement the necessary background processing
    before marking this item complete.
  - Current limitation: An API restart marks running jobs failed and
    retryable; automatic continuation after server restart is not implied by
    logout or browser closure.

## Integration

- [ ] Run focused API and browser regressions and both builds; verify the
  updated pages, dark/light themes, keyboard behavior, and mobile layouts.
- [ ] Record each completed user-visible update in matching database-backed
  and built-in changelog entries, rebuild the local Compose stack, and verify
  health and the private preview.
