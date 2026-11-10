import { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Breadcrumbs, Button, Center, Divider, Group, Modal, Paper, Select, Skeleton, Stack, Text, Textarea, TextInput, ThemeIcon } from '@mantine/core';
import { BookOpen, ChevronRight } from 'lucide-react';
import ApiService, { Language, VocabularyEntry, VocabularyGroup } from '../../api';
import { LANGUAGE_OPTIONS, languageName } from '../shared/language-options';

export default function VocabularyPage({ token }: { token: string }) {
  const [groups, setGroups] = useState<VocabularyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [groupDraft, setGroupDraft] = useState<{
    id?: string; name: string; description: string; sourceLanguage: Language; targetLanguage: Language;
  } | null>(null);
  const [entryDraft, setEntryDraft] = useState<{ groupId: string; entry?: VocabularyEntry; source: string; target: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setGroups(await ApiService.getVocabularyGroups(token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load vocabulary.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void refresh(); }, [refresh]);

  const saveGroup = async () => {
    if (!groupDraft) return;
    setBusy(true); setError('');
    try {
      const details = { name: groupDraft.name.trim(), description: groupDraft.description.trim() || null, sourceLanguage: groupDraft.sourceLanguage, targetLanguage: groupDraft.targetLanguage };
      if (groupDraft.id) await ApiService.updateVocabularyGroup(groupDraft.id, details, token);
      else await ApiService.createVocabularyGroup(details, token);
      setGroupDraft(null); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save vocabulary group.'); }
    finally { setBusy(false); }
  };

  const removeGroup = async (group: VocabularyGroup) => {
    if (!window.confirm(`Delete “${group.name}” and its ${group.entries.length} terms?`)) return;
    setBusy(true); setError('');
    try { await ApiService.deleteVocabularyGroup(group.id, token); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete vocabulary group.'); }
    finally { setBusy(false); }
  };

  const saveEntry = async () => {
    if (!entryDraft) return;
    setBusy(true); setError('');
    try {
      const term = { source: entryDraft.source.trim(), target: entryDraft.target.trim() };
      if (entryDraft.entry) await ApiService.updateVocabularyEntry(entryDraft.groupId, entryDraft.entry.id, term, token);
      else await ApiService.createVocabularyEntry(entryDraft.groupId, term, token);
      setEntryDraft(null); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save vocabulary term.'); }
    finally { setBusy(false); }
  };

  const removeEntry = async (group: VocabularyGroup, entry: VocabularyEntry) => {
    if (!window.confirm(`Delete “${entry.source} → ${entry.target}”?`)) return;
    setBusy(true); setError('');
    try { await ApiService.deleteVocabularyEntry(group.id, entry.id, token); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete vocabulary term.'); }
    finally { setBusy(false); }
  };

  return <Stack gap="lg">
    <Breadcrumbs separator={<ChevronRight size={14} />}><Text size="sm" c="dimmed">Workspace</Text><Text size="sm">Vocabulary</Text></Breadcrumbs>
    <Group justify="space-between" align="end"><Box><Text fz="h1" fw={700}>Vocabulary</Text><Text c="dimmed" mt={4}>Keep product names and specialist terms consistent in translation.</Text></Box><Button onClick={() => setGroupDraft({ name: '', description: '', sourceLanguage: 'JAPANESE', targetLanguage: 'ENGLISH' })}>New group</Button></Group>
    {error && <Paper withBorder radius="md" p="sm" bg="red.0"><Text c="red" size="sm" role="alert">{error}</Text></Paper>}
    {loading ? <Stack gap="sm">{[1, 2].map((item) => <Paper key={item} withBorder p="md"><Skeleton height={18} width="45%" /><Skeleton height={12} mt="sm" width="75%" /></Paper>)}</Stack>
      : groups.length ? <Stack gap="sm">{groups.map((group) => <Paper key={group.id} withBorder radius="md" p="md">
        <Stack gap="sm"><Group justify="space-between" align="flex-start"><Box><Group gap="xs"><Text fw={650}>{group.name}</Text><Badge variant="light" color="teal">{languageName(group.sourceLanguage)} → {languageName(group.targetLanguage)}</Badge></Group>{group.description && <Text size="sm" c="dimmed" mt={4}>{group.description}</Text>}</Box>
          <Group gap="xs"><Button size="xs" variant="default" disabled={busy} onClick={() => setGroupDraft({ id: group.id, name: group.name, description: group.description ?? '', sourceLanguage: group.sourceLanguage, targetLanguage: group.targetLanguage })}>Edit group</Button><Button size="xs" color="red" variant="subtle" disabled={busy} onClick={() => void removeGroup(group)}>Delete</Button></Group></Group>
          <Divider />
          {group.entries.length ? <Stack gap={4}>{group.entries.map((entry) => <Group key={entry.id} justify="space-between" wrap="nowrap" className="vocabulary-entry">
            <Group gap="xs" wrap="wrap"><Text size="sm" fw={550}>{entry.source}</Text><Text size="sm" c="dimmed">→</Text><Text size="sm">{entry.target}</Text></Group>
            <Group gap={4} wrap="nowrap"><Button size="xs" variant="subtle" disabled={busy} onClick={() => setEntryDraft({ groupId: group.id, entry, source: entry.source, target: entry.target })}>Edit</Button><Button size="xs" variant="subtle" color="red" disabled={busy} onClick={() => void removeEntry(group, entry)}>Remove</Button></Group>
          </Group>)}</Stack> : <Text size="sm" c="dimmed">No protected terms yet.</Text>}
          <Button size="xs" variant="light" onClick={() => setEntryDraft({ groupId: group.id, source: '', target: '' })}>Add term</Button>
        </Stack>
      </Paper>)}</Stack> : <Paper withBorder radius="md" p="xl"><Center><Stack align="center" gap="xs"><ThemeIcon size={46} variant="light" color="gray"><BookOpen size={23} /></ThemeIcon><Text fw={600}>No vocabulary groups</Text><Text c="dimmed" size="sm" ta="center">Create a language pair group, then add terms to protect them during translation.</Text><Button onClick={() => setGroupDraft({ name: '', description: '', sourceLanguage: 'JAPANESE', targetLanguage: 'ENGLISH' })}>Create vocabulary group</Button></Stack></Center></Paper>}

    <Modal opened={Boolean(groupDraft)} onClose={() => setGroupDraft(null)} title={groupDraft?.id ? 'Edit vocabulary group' : 'New vocabulary group'} centered>
      {groupDraft && <Stack gap="md"><TextInput label="Group name" value={groupDraft.name} maxLength={100} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.currentTarget.value })} required />
        <Textarea label="Description" value={groupDraft.description} maxLength={1000} autosize minRows={2} maxRows={4} onChange={(event) => setGroupDraft({ ...groupDraft, description: event.currentTarget.value })} />
        <Select label="Source language" data={LANGUAGE_OPTIONS} value={groupDraft.sourceLanguage} onChange={(value) => value && setGroupDraft({ ...groupDraft, sourceLanguage: value as Language })} />
        <Select label="Target language" data={LANGUAGE_OPTIONS} value={groupDraft.targetLanguage} onChange={(value) => value && setGroupDraft({ ...groupDraft, targetLanguage: value as Language })} />
        {groupDraft.sourceLanguage === groupDraft.targetLanguage && <Text c="red" size="sm" role="alert">Choose two different languages.</Text>}
        <Group justify="flex-end"><Button variant="default" onClick={() => setGroupDraft(null)}>Cancel</Button><Button onClick={() => void saveGroup()} loading={busy} disabled={!groupDraft.name.trim() || groupDraft.sourceLanguage === groupDraft.targetLanguage}>Save group</Button></Group>
      </Stack>}
    </Modal>
    <Modal opened={Boolean(entryDraft)} onClose={() => setEntryDraft(null)} title={entryDraft?.entry ? 'Edit protected term' : 'Add protected term'} centered>
      {entryDraft && <Stack gap="md"><TextInput label="Source term" value={entryDraft.source} maxLength={200} onChange={(event) => setEntryDraft({ ...entryDraft, source: event.currentTarget.value })} required />
        <TextInput label="Translation" value={entryDraft.target} maxLength={200} onChange={(event) => setEntryDraft({ ...entryDraft, target: event.currentTarget.value })} required />
        <Group justify="flex-end"><Button variant="default" onClick={() => setEntryDraft(null)}>Cancel</Button><Button onClick={() => void saveEntry()} loading={busy} disabled={!entryDraft.source.trim() || !entryDraft.target.trim()}>{entryDraft.entry ? 'Save term' : 'Add term'}</Button></Group>
      </Stack>}
    </Modal>
  </Stack>;
}
