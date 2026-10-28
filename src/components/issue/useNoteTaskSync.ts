import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import useDebounce from '@/lib/hooks/useDebounce';
import { useIssueData, useIssueStore } from './issueStore';
import { loadNoteTasks, syncNoteTasks } from './noteTasks';

const SYNC_DEBOUNCE_MS = 1000;

/**
 * Keep issues created from note tasks in sync with their notes (see
 * syncNoteTasks). Runs once all notes are loaded, and again after edits.
 */
export default function useNoteTaskSync() {
  const { data, isLoaded: issuesLoaded } = useIssueData();
  const notesLoaded = useStore((state) => state.isLoaded);
  const [notes] = useDebounce(useStore((state) => state.notes), SYNC_DEBOUNCE_MS);
  const apply = useIssueStore((s) => s.apply);
  const hasTaskIssues = data.issues.some((i) => i.noteTask);

  useEffect(() => {
    // a partial note list would look like removed tasks, so wait for all notes
    if (!issuesLoaded || !notesLoaded || !hasTaskIssues) return;
    let cancelled = false;
    loadNoteTasks(notes)
      .then((tasks) => {
        if (!cancelled) apply((d) => syncNoteTasks(d, tasks, notes));
      })
      .catch((e) => console.error('Failed to read the tasks of the notes', e));
    return () => { cancelled = true; };
  }, [issuesLoaded, notesLoaded, hasTaskIssues, notes, apply]);
}
