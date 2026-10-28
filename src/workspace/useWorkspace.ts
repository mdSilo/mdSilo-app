import { useStore } from '@/state/store';
import { readingRoot, writingRoot } from './layout';

/** Where the notes are in the open workspace, see writingRoot. */
export function useWritingRoot(): string | undefined {
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  return writingRoot({ initDir, layout });
}

/** Where the books are in the open workspace, see readingRoot. */
export function useReadingRoot(): string | undefined {
  const initDir = useStore((state) => state.initDir);
  const layout = useStore((state) => state.layout);
  return readingRoot({ initDir, layout });
}
