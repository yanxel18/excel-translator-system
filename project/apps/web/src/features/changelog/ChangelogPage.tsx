import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Group, Paper, Skeleton, Stack, Text } from '@mantine/core';
import { CalendarDays, Tag } from 'lucide-react';
import ApiService, { type ChangelogEntry } from '../../api';
import { useLocale } from '../shared/LocaleProvider';

const initialHistory: ChangelogEntry[] = [
  { id: 'changelog-20261112-v2-base-reassignment', title: 'Manage user Bases and strengthen setup', details: 'Administrators can reassign a user to an existing Base. Workbook input checks and page navigation were improved, and database setup was repaired for new installations.', publishedAt: '2026-11-12T04:00:00.000Z' },
  { id: 'changelog-20261112-v2-settings-hardening', title: 'Improve Version 2 settings and navigation', details: 'Improved account and Base management feedback, strengthened request validation and progress ownership checks, and fixed direct navigation through the deployed application path.', publishedAt: '2026-11-12T03:00:00.000Z' },
  { id: 'changelog-20261112-v2-management-foundation', title: 'Add Version 2 management foundations', details: 'Added administrator settings for managing Bases and registering and finding users, shareable page navigation, account session checks, and stronger validation for several API inputs. Further integration and accessibility verification is in progress.', publishedAt: '2026-11-12T02:20:00.000Z' },
  { id: 'changelog-20261112-notification-test', title: 'Update notification pagination checks', details: 'Updated the notification regression checks to cover ten-item pages and the total count returned by the current notification list.', publishedAt: '2026-11-12T02:10:00.000Z' },
  { id: 'changelog-20261112-v2-baseline', title: 'Prepare the Version 2 development baseline', details: 'Fixed a Workspace layout type error and documented the account, access, and migration rules for Version 2. The existing notification test failure is recorded for follow-up.', publishedAt: '2026-11-12T02:00:00.000Z' },
  { id: 'changelog-20261112-version-two-roadmap', title: 'Record the Version 2 implementation roadmap', details: 'Added a separate Version 2 plan and task checklist for administration, authentication, profile navigation, searchable history, security, branding, and footer improvements. These features are planned for implementation.', publishedAt: '2026-11-12T01:20:00.000Z' },
  { id: 'changelog-20261112-profile-readonly-tabs', title: 'Keep profile details read-only until edited', details: 'Added Overview and Account tabs to the profile. Account details now stay read-only until Edit info is selected, with save and cancel actions in the page header.', publishedAt: '2026-11-12T01:10:00.000Z' },
  { id: 'changelog-20261112-profile-activity-dashboard', title: 'Bring profile and account activity together', details: 'Moved account details out of the Settings dialog and added a responsive profile dashboard with personal workbook metrics, activity charts, and recent translations.', publishedAt: '2026-11-12T00:30:00.000Z' },
  { id: 'changelog-20261112-notification-count-badge', title: 'Show full unread notification counts', details: 'The unread count beside Notifications now expands to fit multiple digits instead of clipping them.', publishedAt: '2026-11-12T01:00:00.000Z' },
  { id: 'changelog-20261112-notification-pagination', title: 'Browse notifications in pages of ten', details: 'The Notifications page now shows ten updates at a time with numbered page controls at the bottom.', publishedAt: '2026-11-12T00:20:00.000Z' },
  { id: 'changelog-20261112-sidebar-navigation-localization', title: 'Fix sidebar labels in Japanese and Chinese', details: 'Replaced question mark placeholders with Japanese and Chinese text for the dashboard, home navigation, and workspace description.', publishedAt: '2026-11-12T00:10:00.000Z' },
  { id: 'changelog-20261112-fix-text-count-separator', title: 'Fix the text count separator on ongoing translations', details: 'Replaced the stray question mark between the added date and text item count with a readable separator.', publishedAt: '2026-11-12T00:00:00.000Z' },
  { id: 'changelog-20261111-setup-guides', title: 'Add setup guides for the application', details: 'Updated the project, frontend and backend guides with local configuration, architecture and Docker Compose instructions.', publishedAt: '2026-11-11T17:10:00.000Z' },
  { id: 'changelog-20261111-sort-recent-by-completion', title: 'Sort recent translations by completion time', details: 'Recent translations are now ordered by when they finished, so the most recently completed workbook appears first.', publishedAt: '2026-11-11T17:00:00.000Z' },
  { id: 'changelog-20261111-notification-localization', title: 'Show notification controls in Japanese and Chinese', details: 'Fixed question mark placeholders and added Japanese and Chinese translations for notification search, filters, date labels, and actions.', publishedAt: '2026-11-11T16:40:00.000Z' },
  { id: 'changelog-20261111-compact-recent-translations', title: 'Compact recent translations into one card', details: 'Recent translations now appear as five compact rows in a single card. View and Download use icon buttons, while progress bars remain on processing work in Ongoing.', publishedAt: '2026-11-11T16:30:00.000Z' },
  { id: 'changelog-20261111-workspace-translation-columns', title: 'See ongoing and recent translations side by side', details: 'The Workspace now places ongoing translations beside the ten most recent translations on wide screens, stacks them on smaller screens, and links directly to full history.', publishedAt: '2026-11-11T16:20:00.000Z' },
  { id: 'changelog-20261111-recent-translations-view-all', title: 'Show ten recent translations with a direct link to history', details: 'The dashboard now shows the ten newest translations and a View all link that opens the History page.', publishedAt: '2026-11-11T16:10:00.000Z' },
  { id: 'changelog-20261111-history-navigation', title: 'Browse translations with pages and clear language badges', details: 'Added numbered pagination to recent translations and translation history, showing five workbooks per page. Language pairs now use readable badges with flag icons.', publishedAt: '2026-11-11T16:00:00.000Z' },
  { id: 'changelog-20261111-notification-lazy-loading', title: 'Load notifications as you scroll', details: 'The Notifications page now shows 10 updates at first and adds 5 more as you scroll through older activity.', publishedAt: '2026-11-11T16:00:00.000Z' },
  { id: 'changelog-20261111-changelog-pagination', title: 'Browse changelog updates in pages', details: 'The Changelog now shows the 10 newest updates first and lets you load older entries in pages, including when using the built-in timeline.', publishedAt: '2026-11-11T14:40:00.000Z' },
  { id: 'changelog-20261111-admin-keycloak-settings', title: 'Administrators can manage Keycloak sign-in', details: 'Added an administrator-only Keycloak settings panel in Profile. Administrators can enable OIDC, set the provider and group requirement, and save changes to PostgreSQL; the API enforces administrator access.', publishedAt: '2026-11-11T14:35:00.000Z' },
  { id: 'changelog-20261111-changelog-policy', title: 'Every project update now gets a changelog entry', details: 'Established a project-wide contribution rule to record each completed update in the Changelog and keep database history and the built-in timeline in sync.', publishedAt: '2026-11-11T14:31:00.000Z' },
  { id: 'changelog-20261111-deployment', title: 'Ready for deployment and workbook review', details: 'Added configurable /excel-convert deployment, persistent production services, focused tests, and an optional checksum-pinned ibisOffice preview integration for translated workbooks.', publishedAt: '2026-11-11T12:00:00.000Z' },
  { id: 'changelog-20261111-app-experience', title: 'A complete workspace experience', details: 'Introduced the Mantine application shell and workspace views for translation, history, vocabulary, notifications, and profile. Added saved English, Japanese, and Chinese preferences, light and dark themes, responsive layouts, and clearer loading and progress feedback.', publishedAt: '2026-11-11T09:00:00.000Z' },
  { id: 'changelog-20261110-product-surfaces', title: 'History, previews, and account tools arrive', details: 'Added translation history with preview, download, and delete actions, along with profile editing, notifications, and the changelog. Application data surfaces support cursor pagination.', publishedAt: '2026-11-10T21:00:00.000Z' },
  { id: 'changelog-20261110-workbook-integrity', title: 'More faithful workbook handling', details: 'Hardened XLSX extraction and patching to preserve formulas, formatting, and shared strings. Added archive safety checks and structural validation before translated workbooks are published.', publishedAt: '2026-11-10T18:00:00.000Z' },
  { id: 'changelog-20261110-vocabulary', title: 'Protect the terms that matter', details: 'Added vocabulary groups and protected translations for supported language pairs. Choose worksheets and compatible vocabulary before starting a translation.', publishedAt: '2026-11-10T15:00:00.000Z' },
  { id: 'changelog-20261110-translation-workflow', title: 'Translation jobs become reliable', details: 'Added persisted workbook settings, worksheet selection, language choices, retry-safe job claiming, lifecycle notifications, and recovery for jobs interrupted by an API restart.', publishedAt: '2026-11-10T12:00:00.000Z' },
  { id: 'changelog-20261110-foundation', title: 'The translator platform takes shape', details: 'Established the persistent platform foundation with PostgreSQL-backed accounts and translation jobs. Added local and OIDC authentication boundaries, secure workbook storage, and a durable job lifecycle.', publishedAt: '2026-11-10T09:00:00.000Z' },
];

export default function ChangelogPage({ token }: { token: string }) {
  const { t, locale } = useLocale();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (next?: string) => {
    setLoading(true); setError('');
    try {
      if (next?.startsWith('fallback:')) {
        const offset = Number(next.slice('fallback:'.length));
        setEntries((current) => [...current, ...initialHistory.slice(offset, offset + 10)]);
        setCursor(offset + 10 < initialHistory.length ? `fallback:${offset + 10}` : null);
        return;
      }
      const page = await ApiService.getChangelog(token, next);
      const useFallback = !next && page.data.length === 0;
      setEntries((current) => next ? [...current, ...page.data] : useFallback ? initialHistory.slice(0, 10) : page.data);
      setCursor(useFallback ? initialHistory.length > 10 ? 'fallback:10' : null : page.nextCursor);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load changelog.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  return <Stack gap="lg" className="changelog-page"><div className="changelog-heading"><Text component="h1" fz="h2" fw={700}>{t('Changelog')}</Text><Text size="sm" c="dimmed">{t('Recent product updates.')}</Text></div>
    {error && <Text c="red" role="alert">{error}</Text>}{loading && !entries.length ? <Stack aria-label={t('Loading changelog')} aria-busy="true"><Skeleton height={120} /><Skeleton height={120} /></Stack> : !entries.length ? <Paper withBorder p="xl"><Text c="dimmed">{t('No updates have been published.')}</Text></Paper> : <Stack gap="md" className="changelog-list">{entries.map((entry) => <Paper component="article" key={entry.id} withBorder className="changelog-entry">
      <Group gap="xs" className="changelog-meta"><Group gap={6} wrap="nowrap"><CalendarDays size={14} /><Text size="xs">{new Date(entry.publishedAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</Text></Group><Badge leftSection={<Tag size={11} />} variant="light" color="blue">{t('Product update')}</Badge></Group>
      <Text component="h2" fw={650} className="changelog-title">{entry.title}</Text><Text size="sm" className="changelog-details">{entry.details}</Text>
    </Paper>)}</Stack>}
    {cursor && <Group justify="center"><Button variant="default" loading={loading} onClick={() => void load(cursor)}>{t('Load older updates')}</Button></Group>}
  </Stack>;
}
