import { useMemo } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import { useIssueData } from 'components/issue/issueStore';
import { computeIssueRefs } from 'components/issue/refs';
import { StateIcon } from 'components/issue/common';

type Props = {
  noteId: string;
  title: string;
  className?: string;
};

/** "Referenced by issues": issues linking this note, explicitly or via [[title]]. */
export default function IssueRefs({ noteId, title, className = '' }: Props) {
  const { data, isLoaded } = useIssueData();
  const { dispatch } = useCurrentViewContext();
  const refs = useMemo(() => computeIssueRefs(data.issues, noteId, title), [data.issues, noteId, title]);

  if (!isLoaded || refs.length === 0) return null;

  return (
    <div className={`pt-2 ${className}`} data-testid="issue-refs">
      <p className="p-1 text-gray-600 dark:text-gray-300">Referenced by issues</p>
      <ul className="mx-4">
        {refs.map(({ issue, explicit }) => (
          <li key={issue.number} className="flex items-center gap-2 py-1">
            <StateIcon state={issue.state} size={16} />
            <button
              type="button"
              className="text-left link"
              onClick={() => dispatch({ view: 'issue', number: issue.number })}
            >
              #{issue.number} {issue.title}
            </button>
            {explicit ? null : <span className="text-xs text-gray-500">mentioned</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
