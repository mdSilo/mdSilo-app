import { create } from 'zustand';

/**
 * Notes changed on disk under the editor, e.g. by a sync: bumped when the
 * note open changed, its editor is mounted again (see writer/MdView).
 */
export const useNoteReloads = create<{ seq: number }>(() => ({ seq: 0 }));

export const reloadOpenNote = () => useNoteReloads.setState((s) => ({ seq: s.seq + 1 }));
