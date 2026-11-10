import { Breadcrumbs, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { BookOpen, ChevronRight } from 'lucide-react';
import { View } from './types';

type PlaceholderView = Exclude<View, 'workspace' | 'vocabulary' | 'notifications'>;

export default function PlaceholderPage({ view }: { view: PlaceholderView }) {
  const descriptions: Record<PlaceholderView, string> = {
    history: 'Searchable completed-workbook history and spreadsheet previews are the next data slice.',
    changelog: 'Product updates and release notes will be published here.',
    profile: 'Profile fields and identity provider details will appear here.',
  };
  const titles: Record<PlaceholderView, string> = {
    history: 'Translation history',
    changelog: 'Changelog',
    profile: 'Profile',
  };

  return <Stack gap="lg">
    <Breadcrumbs separator={<ChevronRight size={14} />}>
      {[<Text key="home" size="sm" c="dimmed">Workspace</Text>, <Text key="current" size="sm">{titles[view]}</Text>]}
    </Breadcrumbs>
    <Paper withBorder radius="md" p="xl">
      <Stack align="center" gap="sm">
        <ThemeIcon size={52} radius="xl" variant="light" color="teal"><BookOpen size={25} /></ThemeIcon>
        <Text fz="h2" fw={700}>{titles[view]}</Text>
        <Text c="dimmed" ta="center" maw={420}>{descriptions[view]}</Text>
      </Stack>
    </Paper>
  </Stack>;
}
