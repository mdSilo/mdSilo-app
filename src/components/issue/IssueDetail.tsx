import { useMemo, useState } from 'react';
import { TbArrowLeft as IconBack, TbTrash as IconTrash } from 'react-icons/tb';
import { useStore } from '@/lib/store';
import { useCurrentViewContext } from '@/context/useCurrentView';
import useDebounce from '@/lib/hooks/useDebounce';
import useOnNoteLinkClick from '@/editor/hooks/useOnNoteLinkClick';
import ErrorBoundary from '@/components/misc/ErrorBoundary';
import { useIssueData, useIssueStore } from './issueStore';
import {
  addComment, commentCount, deleteIssue, getIssue, isOverdue, setDueOn, setState, updateIssue,
} from './issueOps';
import { computeNoteMentions } from './refs';
import { StateBadge, TimeAgo, btnClass, inputClass, primaryBtnClass } from './common';
import IssueEditor from './IssueEditor';
import Timeline from './Timeline';
import LabelPicker from './pickers/LabelPicker';
import MilestonePicker from './pickers/MilestonePicker';
import ProjectPicker from './pickers/ProjectPicker';
import NotePicker from './pickers/NotePicker';
import Subtasks from './Subtasks';
import type { Issue } from './types';

type Props = {
  number: number;
  /** set when shown in a modal (e.g. from the project board) */
  onClose?: () => void;
};

export default function IssueDetail({ number, onClose }: Props) {
  const { data, isLoaded } = useIssueData();
  const issue = getIssue(data, number);
  const { dispatch } = useCurrentViewContext();

  if (!isLoaded) {
    return <p className="p-8 text-base-content/60">Loading issues…</p>;
  }
  if (!issue) {
    return (
      <div className="p-8">
        <p className="mb-4">Issue #{number} does not exist.</p>
        <button type="button" className="ms-link" onClick={() => dispatch({ view: 'issues' })}>Back to issues</button>
      </div>
    );
  }
  return (
    <ErrorBoundary>
      <IssueBody key={issue.number} issue={issue} onClose={onClose} />
    </ErrorBoundary>
  );
}

function IssueBody({ issue, onClose }: { issue: Issue; onClose?: () => void }) {
  const { data } = useIssueData();
  const apply = useIssueStore((s) => s.apply);
  const { dispatch } = useCurrentViewContext();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(issue.title);
  const [comment, setComment] = useState('');
  const [commentKey, setCommentKey] = useState(0);
  const num = issue.number;

  const submitComment = (close?: boolean) => {
    if (comment.trim()) apply((d) => addComment(d, num, comment));
    if (close !== undefined) apply((d) => setState(d, num, close ? 'closed' : 'open'));
    setComment('');
    setCommentKey((k) => k + 1);
  };

  const saveTitle = () => {
    apply((d) => updateIssue(d, num, { title: titleDraft }));
    setEditingTitle(false);
  };

  const comments = commentCount(issue);

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto bg-base-100" data-testid="issue-detail">
      <div className="w-full max-w-5xl px-6 py-4 mx-auto">
        {onClose ? null : (
          <button type="button" className="flex items-center gap-1 mb-2 text-sm ms-link" onClick={() => dispatch({ view: 'issues' })}>
            <IconBack size={14} /> Issues
          </button>
        )}
        {/* header */}
        <div className="pb-3 mb-4 border-b border-base-300">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                aria-label="Issue title"
                className={`${inputClass} flex-1 text-xl`}
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
              />
              <button type="button" className={btnClass} onClick={saveTitle}>Save</button>
              <button type="button" className={btnClass} onClick={() => setEditingTitle(false)}>Cancel</button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <h1 className="flex-1 text-2xl">
                {issue.title} <span className="text-base-content/50">#{num}</span>
              </h1>
              <button type="button" className={btnClass} onClick={() => { setTitleDraft(issue.title); setEditingTitle(true); }}>
                Edit
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 text-sm text-base-content/60">
            <StateBadge state={issue.state} />
            <span>opened <TimeAgo iso={issue.createdAt} /> · {comments} comment{comments === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* main column */}
          <div className="flex-1 min-w-0">
            <div className="px-3 py-2 border border-base-300 rounded-sm">
              <IssueEditor
                defaultValue={issue.body}
                placeholder="Describe the issue… [[Note]] links a note"
                onChange={(body) => apply((d) => updateIssue(d, num, { body }))}
              />
            </div>
            <Subtasks issue={issue} />
            <div className="mt-4">
              <Timeline issue={issue} />
            </div>
            <div className="mt-4 border border-base-300 rounded-sm">
              <div className="px-3 py-2 min-h-24">
                <IssueEditor key={`new-comment-${commentKey}`} defaultValue="" placeholder="Leave a comment" onChange={setComment} />
              </div>
              <div className="flex justify-end gap-2 px-3 py-2 border-t border-base-300">
                <button type="button" className={btnClass} onClick={() => submitComment(issue.state === 'open')}>
                  {issue.state === 'open'
                    ? (comment.trim() ? 'Close with comment' : 'Close issue')
                    : (comment.trim() ? 'Reopen with comment' : 'Reopen issue')}
                </button>
                <button type="button" className={primaryBtnClass} disabled={!comment.trim()} onClick={() => submitComment()}>
                  Comment
                </button>
              </div>
            </div>
          </div>

          {/* sidebar */}
          <aside className="w-full md:w-64 shrink-0">
            <LabelPicker issue={issue} labels={data.labels} />
            <MilestonePicker issue={issue} data={data} />
            <DueDate issue={issue} />
            <ProjectPicker issue={issue} data={data} />
            <NotePicker issue={issue} />
            <NoteMentions num={num} />
            <button
              type="button"
              className="flex items-center gap-1 mt-4 text-sm text-error hover:underline"
              onClick={() => {
                if (!window.confirm(`Delete issue #${num}? This cannot be undone.`)) return;
                apply((d) => deleteIssue(d, num));
                if (onClose) onClose(); else dispatch({ view: 'issues' });
              }}
            >
              <IconTrash size={14} /> Delete issue
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** The day the issue is due. */
function DueDate({ issue }: { issue: Issue }) {
  const apply = useIssueStore((s) => s.apply);
  const num = issue.number;
  return (
    <div className="py-3 border-b border-base-300">
      <div className="mb-1 text-xs font-semibold text-base-content/60">Due date</div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          aria-label="Due date"
          className={`${inputClass} flex-1 ${isOverdue(issue) ? 'text-error' : ''}`}
          value={issue.dueOn ?? ''}
          onChange={(e) => apply((d) => setDueOn(d, num, e.target.value || undefined))}
        />
        {issue.dueOn ? (
          <button type="button" className="text-xs ms-link" onClick={() => apply((d) => setDueOn(d, num, undefined))}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Notes linking this issue with `issue:N`. */
function NoteMentions({ num }: { num: number }) {
  const [notes] = useDebounce(useStore((state) => state.notes), 500);
  const mentions = useMemo(() => computeNoteMentions(notes, num), [notes, num]);
  const { onClick: openNote } = useOnNoteLinkClick();
  return (
    <div className="py-3 border-b border-base-300">
      <div className="mb-1 text-xs font-semibold text-base-content/60">Mentioned in notes</div>
      {mentions.length ? (
        <ul className="space-y-1 text-sm">
          {mentions.map((m) => (
            <li key={m.id}>
              <button type="button" className="text-left ms-link" onClick={() => openNote(m.id)}>{m.title}</button>
            </li>
          ))}
        </ul>
      ) : (<span className="text-sm text-base-content/60">None</span>)}
    </div>
  );
}
