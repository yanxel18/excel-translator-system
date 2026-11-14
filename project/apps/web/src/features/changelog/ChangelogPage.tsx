import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { CalendarDays, Tag } from "lucide-react";
import ApiService, { type ChangelogEntry } from "../../api";
import { useLocale } from "../shared/LocaleProvider";

const initialHistory: ChangelogEntry[] = [
  {
    id: "changelog-20261114-workspace-scroll-area",
    title: "Move the workspace scrollbar to the app edge",
    details:
      "Workspace content stays centered while its scroll area spans the app, and translation history keeps its own table scroll area.",
    publishedAt: "2026-11-14T03:21:00.000Z",
  },
  {
    id: "changelog-20261113-history-single-scroll",
    title: "Simplify history scrolling",
    details:
      "Translation history now uses one vertical scroll area, making rows and pagination easier to navigate.",
    publishedAt: "2026-11-13T14:15:00.000Z",
  },
  {
    id: "changelog-20261113-v5-verification",
    title: "Verify version 5 workflows",
    details:
      "The updated footer, history, breadcrumbs, navigation, and translation workflows have been checked together.",
    publishedAt: "2026-11-13T14:00:00.000Z",
  },
  {
    id: "changelog-20261113-v5-shell",
    title: "Keep the footer visible and refine controls",
    details:
      "The footer stays at the bottom while content scrolls, and navigation and account controls use more consistent styling.",
    publishedAt: "2026-11-13T13:50:00.000Z",
  },
  {
    id: "changelog-20261113-v5-history",
    title: "Make translation history easier to scan",
    details:
      "History now keeps table headings visible while scrolling, uses a clearer filename search, and removes redundant filters and totals.",
    publishedAt: "2026-11-13T13:40:00.000Z",
  },
  {
    id: "changelog-20261113-v5-breadcrumbs",
    title: "Navigate from vocabulary breadcrumbs",
    details:
      "The Workspace breadcrumb on Vocabulary now takes you back to your workspace.",
    publishedAt: "2026-11-13T13:30:00.000Z",
  },
  {
    id: "changelog-20261113-v5-plan",
    title: "Plan version 5 interface refinements",
    details:
      "A new plan covers a visible footer, clearer history, navigable breadcrumbs, and consistent button styling.",
    publishedAt: "2026-11-13T13:20:00.000Z",
  },
  {
    id: "changelog-20261113-v4-mobile-account",
    title: "Keep mobile account controls accessible",
    details:
      "The mobile language control no longer blocks the account menu when navigation is open.",
    publishedAt: "2026-11-13T12:50:00.000Z",
  },
  {
    id: "changelog-20261113-v4-visual",
    title: "Refresh the workspace appearance",
    details:
      "The application now has more consistent surfaces and spacing, a compact notification panel, and breathing room above the footer.",
    publishedAt: "2026-11-13T12:44:00.000Z",
  },
  {
    id: "changelog-20261113-v4-page-controls",
    title: "Refine history and vocabulary controls",
    details:
      "History page size now sits compactly beside pagination, and vocabulary actions and terms are easier to use on small screens.",
    publishedAt: "2026-11-13T12:43:00.000Z",
  },
  {
    id: "changelog-20261113-v4-shell",
    title: "Simplify navigation and account controls",
    details:
      "A compact navigation rail now holds the profile avatar and theme control, with one language selector and a clearer workspace icon.",
    publishedAt: "2026-11-13T12:39:00.000Z",
  },
  {
    id: "changelog-20261113-v4-roadmap",
    title: "Plan version 4 interface improvements",
    details:
      "A new plan outlines a more cohesive interface, compact navigation and notifications, and clearer history and vocabulary controls.",
    publishedAt: "2026-11-13T12:26:00.000Z",
  },
  {
    id: "changelog-20261113-v3-verification",
    title: "Verify version 3 workflows",
    details:
      "The updated vocabulary, history, account controls, workbook actions, and translation workflows have been checked together.",
    publishedAt: "2026-11-13T12:07:00.000Z",
  },
  {
    id: "changelog-20261113-translation-concurrency",
    title: "Control simultaneous translations",
    details:
      "Administrators can configure up to five simultaneous translations, with clear capacity errors and recovery for interrupted jobs.",
    publishedAt: "2026-11-13T12:00:00.000Z",
  },
  {
    id: "changelog-20261113-shell-controls",
    title: "Move account and language controls",
    details:
      "The account avatar, profile details, and theme toggle are now at the lower left, with a language selector at the lower right.",
    publishedAt: "2026-11-13T11:40:00.000Z",
  },
  {
    id: "changelog-20261113-recent-translation-columns",
    title: "Align recent translation details",
    details:
      "Recent translations now show filenames, statuses, and available file actions in separate aligned columns.",
    publishedAt: "2026-11-13T11:19:00.000Z",
  },
  {
    id: "changelog-20261113-workbook-svg-icons",
    title: "Use workbook icons throughout the app",
    details:
      "Workbook views now use an original Excel-style SVG icon that remains decorative for assistive technology.",
    publishedAt: "2026-11-13T11:16:00.000Z",
  },
  {
    id: "changelog-20261113-vocabulary-icon-actions",
    title: "Simplify vocabulary group actions",
    details:
      "Edit, add-term, and delete controls now sit together beside the vocabulary group name as accessible icon buttons.",
    publishedAt: "2026-11-13T11:13:00.000Z",
  },
  {
    id: "changelog-20261113-vocabulary-group-search",
    title: "Search and select vocabulary groups",
    details:
      "Vocabulary groups now appear in a searchable selector, so users can quickly find a group and manage its protected terms.",
    publishedAt: "2026-11-13T11:10:00.000Z",
  },
  {
    id: "changelog-20261113-history-automatic-updates",
    title: "Keep translation history up to date automatically",
    details:
      "Translation history now checks for new jobs and status changes automatically, preserves the current filters and page, and shows an error when an update fails.",
    publishedAt: "2026-11-13T11:08:00.000Z",
  },
  {
    id: "changelog-20261113-history-table-scrolling",
    title: "Keep history lists easy to scroll",
    details:
      "Long translation history lists now scroll within the table, while search controls and pagination remain outside the scrolling area and accessible on narrow screens.",
    publishedAt: "2026-11-13T11:05:00.000Z",
  },
  {
    id: "changelog-20261113-history-filename-preview",
    title: "Open workbook previews from history filenames",
    details:
      "History filenames now open the same original workbook preview as the View action, with an underline on hover and a visible keyboard focus indicator.",
    publishedAt: "2026-11-13T11:01:00.000Z",
  },
  {
    id: "changelog-20261113-history-pagination-layout",
    title: "Keep history pagination controls together",
    details:
      "Moved the rows-per-page selector below the history list beside the page controls, while preserving filters and shareable page settings.",
    publishedAt: "2026-11-13T10:58:00.000Z",
  },
  {
    id: "changelog-20261113-translation-settings-start",
    title: "Restore saving and starting translations",
    details:
      "Fixed an error that prevented translation settings from saving and jobs from starting when extra job details were sent with the settings.",
    publishedAt: "2026-11-13T10:55:00.000Z",
  },
  {
    id: "changelog-20261113-v3-implementation-plan",
    title: "Document the Version 3 implementation plan",
    details:
      "Added an implementation plan for the Version 3 checklist, including interface behavior, open decisions, translation concurrency, recovery, and verification. The planned features are not yet implemented.",
    publishedAt: "2026-11-13T10:46:35.000Z",
  },
  {
    id: "changelog-20261113-version-three-roadmap",
    title: "Record the Version 3 task roadmap",
    details:
      "Added a Version 3 checklist for vocabulary, translation history, profile and language controls, workbook presentation, and configurable translation concurrency. These changes are planned, not yet implemented.",
    publishedAt: "2026-11-13T10:45:00.000Z",
  },
  {
    id: "changelog-20261113-restore-rest-json",
    title: "Restore password sign-in and API requests",
    details:
      "Fixed a startup issue that prevented password sign-in and other REST requests from reading their JSON data while GraphQL was enabled.",
    publishedAt: "2026-11-13T09:12:00.000Z",
  },
  {
    id: "changelog-20261113-v2-branding-footer",
    title: "Add application branding and a backend-year footer",
    details:
      "Added an original workbook translation mark for the header and favicon, plus a responsive localized footer using the backend-provided Asia/Tokyo calendar year. The year endpoint uses a five-minute public cache, and the footer explains when year metadata is unavailable.",
    publishedAt: "2026-11-13T08:43:13.000Z",
  },
  {
    id: "changelog-20261112-v2-admin-auth-guardrails",
    title: "Protect configured administrator access",
    details:
      "OIDC administrator identity follows the provider username claim. Username edits cannot transfer local administrator access, and disabling an administrator requires another usable administrator login in the configured authentication mode.",
    publishedAt: "2026-11-12T14:10:00.000Z",
  },
  {
    id: "changelog-20261112-v2-search-performance",
    title: "Speed up administration search",
    details:
      "Administrator user and translation-history searches now use query-specific database indexes for faster substring searches. Existing search fields and results are unchanged.",
    publishedAt: "2026-11-12T13:30:00.000Z",
  },
  {
    id: "changelog-20261112-v2-history-controls",
    title: "Search and sort translation history",
    details:
      "Translation history now supports filename and metadata search, source and target language filters, sortable columns, and selectable page sizes from 10 to 50. Search, filters, sorting, and pagination are shareable through the URL and restore with browser navigation.",
    publishedAt: "2026-11-12T13:18:00.000Z",
  },
  {
    id: "changelog-20261112-v2-profile-home",
    title: "Make Profile the personal home",
    details:
      "Profile now brings together the account identity, read-only personal details, and owner-specific translation activity, with a clear Edit info flow and a New translation action. Old Dashboard links lead to Profile; the root and successful sign-in continue to open Workspace.",
    publishedAt: "2026-11-12T13:05:00.000Z",
  },
  {
    id: "changelog-20261112-v2-session-expiry",
    title: "Return safely to sign-in when a session expires",
    details:
      "When an application session expires, the app clears the server-issued sign-in token, stops authenticated polling, and returns to Login with a short message. After signing in again, users can resume a validated internal page; permission denials remain distinct from expired sessions.",
    publishedAt: "2026-11-12T12:45:00.000Z",
  },
  {
    id: "changelog-20261112-v2-authentication-ui",
    title: "Configure sign-in methods from System Settings",
    details:
      "Administrators can configure password-only, Keycloak-only, or combined sign-in on the Authentication settings page. Provider settings are checked before activation, Login follows the selected mode, and configuration or provider sign-in failures offer a retry without bypassing account restrictions.",
    publishedAt: "2026-11-12T12:30:00.000Z",
  },
  {
    id: "changelog-20261112-v2-authentication-modes",
    title: "Choose an authentication mode with safer recovery",
    details:
      "Administrators can select LOCAL, OIDC, or HYBRID authentication from one persisted setting. Existing enabled Keycloak configurations migrate to HYBRID to preserve local and provider sign-in; unsafe issuer URLs are rejected, and deployment guidance documents administrator lockout recovery.",
    publishedAt: "2026-11-12T12:00:00.000Z",
  },
  {
    id: "changelog-20261112-v2-user-password-audit",
    title: "Manage accounts and review administrator changes",
    details:
      "Administrators can edit account details, enable or disable accounts, and reset local passwords. Local users can change their own passwords, and successful account, Base, and authentication-setting changes now produce redacted audit records.",
    publishedAt: "2026-11-12T11:45:00.000Z",
  },
  {
    id: "changelog-20261112-v2-graphql-transport-validation",
    title: "Reject unexpected GraphQL transport fields",
    details:
      "GraphQL HTTP requests now reject unknown JSON body fields and URL query parameters instead of silently ignoring them. Validation errors do not echo submitted values.",
    publishedAt: "2026-11-12T11:08:00.000Z",
  },
  {
    id: "changelog-20261112-v2-validation-feedback",
    title: "Explain account and Base input requirements",
    details:
      "Administrator forms now explain invalid account and Base values before saving, support valid Japanese and Chinese names, and preserve password input exactly. Shared API validation also rejects unknown profile fields and enforces consistent management page sizes.",
    publishedAt: "2026-11-12T10:50:00.000Z",
  },
  {
    id: "changelog-20261112-v2-signin-graphql",
    title: "Restore Keycloak sign-in and GraphQL access",
    details:
      "Fixed Keycloak token verification and authenticated GraphQL requests, strengthened sign-in and request validation, and made successful sign-in open the Workspace.",
    publishedAt: "2026-11-12T05:00:00.000Z",
  },
  {
    id: "changelog-20261112-v2-base-reassignment",
    title: "Manage user Bases and strengthen setup",
    details:
      "Administrators can reassign a user to an existing Base. Workbook input checks and page navigation were improved, and database setup was repaired for new installations.",
    publishedAt: "2026-11-12T04:00:00.000Z",
  },
  {
    id: "changelog-20261112-v2-settings-hardening",
    title: "Improve Version 2 settings and navigation",
    details:
      "Improved account and Base management feedback, strengthened request validation and progress ownership checks, and fixed direct navigation through the deployed application path.",
    publishedAt: "2026-11-12T03:00:00.000Z",
  },
  {
    id: "changelog-20261112-v2-management-foundation",
    title: "Add Version 2 management foundations",
    details:
      "Added administrator settings for managing Bases and registering and finding users, shareable page navigation, account session checks, and stronger validation for several API inputs. Further integration and accessibility verification is in progress.",
    publishedAt: "2026-11-12T02:20:00.000Z",
  },
  {
    id: "changelog-20261112-notification-test",
    title: "Update notification pagination checks",
    details:
      "Updated the notification regression checks to cover ten-item pages and the total count returned by the current notification list.",
    publishedAt: "2026-11-12T02:10:00.000Z",
  },
  {
    id: "changelog-20261112-v2-baseline",
    title: "Prepare the Version 2 development baseline",
    details:
      "Fixed a Workspace layout type error and documented the account, access, and migration rules for Version 2. The existing notification test failure is recorded for follow-up.",
    publishedAt: "2026-11-12T02:00:00.000Z",
  },
  {
    id: "changelog-20261112-version-two-roadmap",
    title: "Record the Version 2 implementation roadmap",
    details:
      "Added a separate Version 2 plan and task checklist for administration, authentication, profile navigation, searchable history, security, branding, and footer improvements. These features are planned for implementation.",
    publishedAt: "2026-11-12T01:20:00.000Z",
  },
  {
    id: "changelog-20261112-profile-readonly-tabs",
    title: "Keep profile details read-only until edited",
    details:
      "Added Overview and Account tabs to the profile. Account details now stay read-only until Edit info is selected, with save and cancel actions in the page header.",
    publishedAt: "2026-11-12T01:10:00.000Z",
  },
  {
    id: "changelog-20261112-profile-activity-dashboard",
    title: "Bring profile and account activity together",
    details:
      "Moved account details out of the Settings dialog and added a responsive profile dashboard with personal workbook metrics, activity charts, and recent translations.",
    publishedAt: "2026-11-12T00:30:00.000Z",
  },
  {
    id: "changelog-20261112-notification-count-badge",
    title: "Show full unread notification counts",
    details:
      "The unread count beside Notifications now expands to fit multiple digits instead of clipping them.",
    publishedAt: "2026-11-12T01:00:00.000Z",
  },
  {
    id: "changelog-20261112-notification-pagination",
    title: "Browse notifications in pages of ten",
    details:
      "The Notifications page now shows ten updates at a time with numbered page controls at the bottom.",
    publishedAt: "2026-11-12T00:20:00.000Z",
  },
  {
    id: "changelog-20261112-sidebar-navigation-localization",
    title: "Fix sidebar labels in Japanese and Chinese",
    details:
      "Replaced question mark placeholders with Japanese and Chinese text for the dashboard, home navigation, and workspace description.",
    publishedAt: "2026-11-12T00:10:00.000Z",
  },
  {
    id: "changelog-20261112-fix-text-count-separator",
    title: "Fix the text count separator on ongoing translations",
    details:
      "Replaced the stray question mark between the added date and text item count with a readable separator.",
    publishedAt: "2026-11-12T00:00:00.000Z",
  },
  {
    id: "changelog-20261111-setup-guides",
    title: "Add setup guides for the application",
    details:
      "Updated the project, frontend and backend guides with local configuration, architecture and Docker Compose instructions.",
    publishedAt: "2026-11-11T17:10:00.000Z",
  },
  {
    id: "changelog-20261111-sort-recent-by-completion",
    title: "Sort recent translations by completion time",
    details:
      "Recent translations are now ordered by when they finished, so the most recently completed workbook appears first.",
    publishedAt: "2026-11-11T17:00:00.000Z",
  },
  {
    id: "changelog-20261111-notification-localization",
    title: "Show notification controls in Japanese and Chinese",
    details:
      "Fixed question mark placeholders and added Japanese and Chinese translations for notification search, filters, date labels, and actions.",
    publishedAt: "2026-11-11T16:40:00.000Z",
  },
  {
    id: "changelog-20261111-compact-recent-translations",
    title: "Compact recent translations into one card",
    details:
      "Recent translations now appear as five compact rows in a single card. View and Download use icon buttons, while progress bars remain on processing work in Ongoing.",
    publishedAt: "2026-11-11T16:30:00.000Z",
  },
  {
    id: "changelog-20261111-workspace-translation-columns",
    title: "See ongoing and recent translations side by side",
    details:
      "The Workspace now places ongoing translations beside the ten most recent translations on wide screens, stacks them on smaller screens, and links directly to full history.",
    publishedAt: "2026-11-11T16:20:00.000Z",
  },
  {
    id: "changelog-20261111-recent-translations-view-all",
    title: "Show ten recent translations with a direct link to history",
    details:
      "The dashboard now shows the ten newest translations and a View all link that opens the History page.",
    publishedAt: "2026-11-11T16:10:00.000Z",
  },
  {
    id: "changelog-20261111-history-navigation",
    title: "Browse translations with pages and clear language badges",
    details:
      "Added numbered pagination to recent translations and translation history, showing five workbooks per page. Language pairs now use readable badges with flag icons.",
    publishedAt: "2026-11-11T16:00:00.000Z",
  },
  {
    id: "changelog-20261111-notification-lazy-loading",
    title: "Load notifications as you scroll",
    details:
      "The Notifications page now shows 10 updates at first and adds 5 more as you scroll through older activity.",
    publishedAt: "2026-11-11T16:00:00.000Z",
  },
  {
    id: "changelog-20261111-changelog-pagination",
    title: "Browse changelog updates in pages",
    details:
      "The Changelog now shows the 10 newest updates first and lets you load older entries in pages, including when using the built-in timeline.",
    publishedAt: "2026-11-11T14:40:00.000Z",
  },
  {
    id: "changelog-20261111-admin-keycloak-settings",
    title: "Administrators can manage Keycloak sign-in",
    details:
      "Added an administrator-only Keycloak settings panel in Profile. Administrators can enable OIDC, set the provider and group requirement, and save changes to PostgreSQL; the API enforces administrator access.",
    publishedAt: "2026-11-11T14:35:00.000Z",
  },
  {
    id: "changelog-20261111-changelog-policy",
    title: "Every project update now gets a changelog entry",
    details:
      "Established a project-wide contribution rule to record each completed update in the Changelog and keep database history and the built-in timeline in sync.",
    publishedAt: "2026-11-11T14:31:00.000Z",
  },
  {
    id: "changelog-20261111-deployment",
    title: "Ready for deployment and workbook review",
    details:
      "Added configurable /excel-convert deployment, persistent production services, focused tests, and an optional checksum-pinned ibisOffice preview integration for translated workbooks.",
    publishedAt: "2026-11-11T12:00:00.000Z",
  },
  {
    id: "changelog-20261111-app-experience",
    title: "A complete workspace experience",
    details:
      "Introduced the Mantine application shell and workspace views for translation, history, vocabulary, notifications, and profile. Added saved English, Japanese, and Chinese preferences, light and dark themes, responsive layouts, and clearer loading and progress feedback.",
    publishedAt: "2026-11-11T09:00:00.000Z",
  },
  {
    id: "changelog-20261110-product-surfaces",
    title: "History, previews, and account tools arrive",
    details:
      "Added translation history with preview, download, and delete actions, along with profile editing, notifications, and the changelog. Application data surfaces support cursor pagination.",
    publishedAt: "2026-11-10T21:00:00.000Z",
  },
  {
    id: "changelog-20261110-workbook-integrity",
    title: "More faithful workbook handling",
    details:
      "Hardened XLSX extraction and patching to preserve formulas, formatting, and shared strings. Added archive safety checks and structural validation before translated workbooks are published.",
    publishedAt: "2026-11-10T18:00:00.000Z",
  },
  {
    id: "changelog-20261110-vocabulary",
    title: "Protect the terms that matter",
    details:
      "Added vocabulary groups and protected translations for supported language pairs. Choose worksheets and compatible vocabulary before starting a translation.",
    publishedAt: "2026-11-10T15:00:00.000Z",
  },
  {
    id: "changelog-20261110-translation-workflow",
    title: "Translation jobs become reliable",
    details:
      "Added persisted workbook settings, worksheet selection, language choices, retry-safe job claiming, lifecycle notifications, and recovery for jobs interrupted by an API restart.",
    publishedAt: "2026-11-10T12:00:00.000Z",
  },
  {
    id: "changelog-20261110-foundation",
    title: "The translator platform takes shape",
    details:
      "Established the persistent platform foundation with PostgreSQL-backed accounts and translation jobs. Added local and OIDC authentication boundaries, secure workbook storage, and a durable job lifecycle.",
    publishedAt: "2026-11-10T09:00:00.000Z",
  },
];

export default function ChangelogPage({ token }: { token: string }) {
  const { t, locale } = useLocale();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(
    async (next?: string) => {
      setLoading(true);
      setError("");
      try {
        if (next?.startsWith("fallback:")) {
          const offset = Number(next.slice("fallback:".length));
          setEntries((current) => [
            ...current,
            ...initialHistory.slice(offset, offset + 10),
          ]);
          setCursor(
            offset + 10 < initialHistory.length
              ? `fallback:${offset + 10}`
              : null,
          );
          return;
        }
        const page = await ApiService.getChangelog(token, next);
        const useFallback = !next && page.data.length === 0;
        setEntries((current) =>
          next
            ? [...current, ...page.data]
            : useFallback
              ? initialHistory.slice(0, 10)
              : page.data,
        );
        setCursor(
          useFallback
            ? initialHistory.length > 10
              ? "fallback:10"
              : null
            : page.nextCursor,
        );
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load changelog.",
        );
      } finally {
        setLoading(false);
      }
    },
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Stack gap="lg" className="changelog-page">
      <div className="changelog-heading">
        <Text component="h1" fz="h2" fw={700}>
          {t("Changelog")}
        </Text>
        <Text size="sm" c="dimmed">
          {t("Recent product updates.")}
        </Text>
      </div>
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
      {loading && !entries.length ? (
        <Stack aria-label={t("Loading changelog")} aria-busy="true">
          <Skeleton height={120} />
          <Skeleton height={120} />
        </Stack>
      ) : !entries.length ? (
        <Paper withBorder p="xl">
          <Text c="dimmed">{t("No updates have been published.")}</Text>
        </Paper>
      ) : (
        <Stack gap="md" className="changelog-list">
          {entries.map((entry) => (
            <Paper
              component="article"
              key={entry.id}
              withBorder
              className="changelog-entry"
            >
              <Group gap="xs" className="changelog-meta">
                <Group gap={6} wrap="nowrap">
                  <CalendarDays size={14} />
                  <Text size="xs">
                    {new Date(entry.publishedAt).toLocaleDateString(locale, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                </Group>
                <Badge
                  leftSection={<Tag size={11} />}
                  variant="light"
                  color="blue"
                >
                  {t("Product update")}
                </Badge>
              </Group>
              <Text component="h2" fw={650} className="changelog-title">
                {entry.title}
              </Text>
              <Text size="sm" className="changelog-details">
                {entry.details}
              </Text>
            </Paper>
          ))}
        </Stack>
      )}
      {cursor && (
        <Group justify="center">
          <Button
            variant="default"
            loading={loading}
            onClick={() => void load(cursor)}
          >
            {t("Load older updates")}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
