import ErrorBoundary from '@/components/misc/ErrorBoundary';
import ForceGraph from '@/components/view/ForceGraph';
import useLoadNotes from '@/lib/hooks/useLoadNotes';

export default function Graph() {
  useLoadNotes();

  return (
    <ErrorBoundary>
      <ForceGraph className="flex-1" />
    </ErrorBoundary>
  );
}
