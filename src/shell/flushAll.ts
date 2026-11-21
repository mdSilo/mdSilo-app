import { flushSave } from "@/workspace/pendingSaves";
import { issueStore } from "@/issue/issueStore";
import { useReaderStore, useSideStore } from "@/reader/readerStore";
import { flushDrawings } from "@/draw/save";

/**
 * Write what waits on the timers of the saves (the note, the books read, the
 * issues, the drawings), e.g. before the window closes or the app reloads.
 */
export async function flushAll(): Promise<void> {
  await Promise.all([
    useReaderStore.getState().flush(),
    useSideStore.getState().flush(),
    issueStore.getState().flush(),
    // the drawings first: their changes go to the pending saves
    flushDrawings().then(() => flushSave()),
  ]);
}
