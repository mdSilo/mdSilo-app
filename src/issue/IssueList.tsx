import { TbMessage as IconComment, TbFlag as IconFlag } from "react-icons/tb";
import { tn, useT } from "@/i18n";
import { commentCount } from "./issueOps";
import { StateIcon, TimeAgo } from "./common";
import LabelChip from "./LabelChip";
import type { Issue, IssueData, Label } from "./types";
import { issueLabel } from "./refs";

type Props = {
  issues: Issue[];
  data: IssueData;
  onOpen: (num: number) => void;
  onClickLabel?: (label: Label) => void;
  onClickMilestone?: (title: string) => void;
  empty?: string;
};

export default function IssueList({
  issues,
  data,
  onOpen,
  onClickLabel,
  onClickMilestone,
  empty,
}: Props) {
  const t = useT();
  if (issues.length === 0) {
    return (
      <p className="p-8 text-center text-base-content/60">
        {empty ?? t("No results.")}
      </p>
    );
  }
  const labelOf = new Map(data.labels.map((l) => [l.id, l]));
  return (
    <ul>
      {issues.map((issue) => {
        const milestone = data.milestones.find((m) => m.id === issue.milestone);
        const comments = commentCount(issue);
        return (
          <li
            key={issue.number}
            className="flex items-start gap-2 px-4 py-2 border-b border-base-300 hover:bg-base-content/5"
            data-testid="issue-row"
          >
            <span className="mt-1">
              <StateIcon state={issue.state} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  className="mr-1 font-semibold text-left hover:text-primary/75"
                  onClick={() => onOpen(issue.number)}
                >
                  {issue.title}
                </button>
                {issue.labels.map((id) => {
                  const label = labelOf.get(id);
                  return label ? (
                    <LabelChip
                      key={id}
                      label={label}
                      onClick={
                        onClickLabel ? () => onClickLabel(label) : undefined
                      }
                    />
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
                <span>
                  {issueLabel(issue.number)}{" "}
                  {issue.state === "open" ? t("opened") : t("closed")}{" "}
                  <TimeAgo
                    iso={
                      issue.state === "closed" && issue.closedAt
                        ? issue.closedAt
                        : issue.createdAt
                    }
                  />
                </span>
                {milestone ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-primary/75"
                    onClick={() => onClickMilestone?.(milestone.title)}
                  >
                    <IconFlag size={12} />
                    {milestone.title}
                  </button>
                ) : null}
                <span>
                  {t("updated")} <TimeAgo iso={issue.updatedAt} />
                </span>
              </div>
            </div>
            {comments > 0 ? (
              <span
                className="flex items-center gap-1 text-sm text-base-content/60"
                title={tn("{count} comment", "{count} comments", comments)}
              >
                <IconComment size={16} />
                {comments}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
