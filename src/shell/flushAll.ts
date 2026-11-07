import { flushSave } from "@/workspace/pendingSaves";
import { issueStore } from "@/issue/issueStore";
import { useReaderStore, useSideStore } from "@/reader/readerStore";

/**
 * Write what waits on the timers of the saves (the note, the books read, the
 * issues), e.g. before the window closes or the app reloads.
 */
export async function flushAll(): Promise<void> {
  await Promise.all([
    useReaderStore.getState().flush(),
    useSideStore.getState().flush(),
    issueStore.getState().flush(),
    flushSave(),
  ]);
}
