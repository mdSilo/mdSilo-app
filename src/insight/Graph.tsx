import ErrorBoundary from '@/ui/ErrorBoundary';
import ForceGraph from '@/insight/ForceGraph';
import useLoadNotes from '@/lib/hooks/useLoadNotes';

export default function Graph() {
  useLoadNotes();

  return (
    <ErrorBoundary>
      <ForceGraph className="flex-1" />
    </ErrorBoundary>
  );
}
