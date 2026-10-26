import { useState } from 'react';
import {
  TbCircleDot as IconOpened, TbCircleCheck as IconClosed, TbRefresh as IconReopened, TbTag as IconTag,
  TbFlag as IconFlag, TbPencil as IconPencil, TbLayoutBoardSplit as IconStatus, TbTrash as IconTrash, TbCheckbox as IconTask,
} from 'react-icons/tb';
import { useIssueStore } from './issueStore';
import { deleteComment, editComment } from './issueOps';
import { TimeAgo, btnClass, primaryBtnClass } from './common';
import IssueEditor from './IssueEditor';
import type { CommentItem, EventItem, Issue, IssueEventKind } from './types';

const EVENT_ICONS: Record<IssueEventKind, typeof IconOpened> = {
  opened: IconOpened,
  closed: IconClosed,
  reopened: IconReopened,
  labeled: IconTag,
  unlabeled: IconTag,
  milestoned: IconFlag,
  demilestoned: IconFlag,
  renamed: IconPencil,
  status: IconStatus,
  task: IconTask,
};

export function eventText(e: EventItem) {
  const d = e.detail ?? '';
  switch (e.event) {
    case 'opened': return 'opened this issue';
    case 'closed': return 'closed this issue';
    case 'reopened': return 'reopened this issue';
    case 'labeled': return `added the ${d} label`;
    case 'unlabeled': return `removed the ${d} label`;
    case 'milestoned': return `added this to the ${d} milestone`;
    case 'demilestoned': return `removed this from the ${d} milestone`;
    case 'renamed': return `changed the title ${d}`;
    case 'status': return `moved this to ${d}`;
    case 'task': return `synced with its note task: ${d}`;
    default: return d;
  }
}

function EventRow({ item }: { item: EventItem }) {
  const Icon = EVENT_ICONS[item.event] ?? IconOpened;
  const color = item.event === 'closed' ? 'text-purple-600' : item.event === 'opened' || item.event === 'reopened' ? 'text-success' : 'text-base-content/60';
  return (
    <li className="flex items-center gap-2 py-2 pl-4 text-sm text-base-content/70" data-testid="timeline-event">
      <Icon size={16} className={color} />
      <span>{eventText(item)}</span>
      <span className="text-xs text-base-content/50"><TimeAgo iso={item.createdAt} /></span>
    </li>
  );
}

function CommentRow({ issue, item }: { issue: Issue; item: CommentItem }) {
  const apply = useIssueStore((s) => s.apply);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [version, setVersion] = useState(0);

  return (
    <li className="my-3 border border-base-300 rounded-sm" data-testid="timeline-comment">
      <div className="flex items-center justify-between px-3 py-1 text-xs text-base-content/60 bg-base-200">
        <span>
          commented <TimeAgo iso={item.createdAt} />
          {item.updatedAt ? <span title={item.updatedAt}> · edited</span> : null}
        </span>
        {editing ? null : (
          <span className="flex gap-2">
            <button type="button" aria-label="Edit comment" className="hover:text-primary/75" onClick={() => { setDraft(item.body); setEditing(true); }}>
              <IconPencil size={14} />
            </button>
            <button
              type="button"
              aria-label="Delete comment"
              className="hover:text-error/80"
              onClick={() => { if (window.confirm('Delete this comment?')) apply((d) => deleteComment(d, issue.number, item.id)); }}
            >
              <IconTrash size={14} />
            </button>
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        {editing ? (
          <>
            <IssueEditor key={`edit-${item.id}-${version}`} defaultValue={item.body} onChange={setDraft} autoFocus />
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" className={btnClass} onClick={() => setEditing(false)}>Cancel</button>
              <button
                type="button"
                className={primaryBtnClass}
                disabled={!draft.trim()}
                onClick={() => {
                  apply((d) => editComment(d, issue.number, item.id, draft));
                  setEditing(false);
                  setVersion((v) => v + 1);
                }}
              >
                Update comment
              </button>
            </div>
          </>
        ) : (
          <IssueEditor key={`view-${item.id}-${version}`} defaultValue={item.body} readOnly />
        )}
      </div>
    </li>
  );
}

export default function Timeline({ issue }: { issue: Issue }) {
  return (
    <ol className="border-l-2 border-base-300 ml-2">
      {issue.timeline.map((item) => (
        item.kind === 'comment'
          ? <CommentRow key={item.id} issue={issue} item={item} />
          : <EventRow key={item.id} item={item} />
      ))}
    </ol>
  );
}
