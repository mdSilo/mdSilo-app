import { useEffect, useState } from "react";
import { TbBrush, TbPlus } from "react-icons/tb";
import { useStore } from "@/state/store";
import { Spinner } from "@/ui/ui";
import { useT } from "@/i18n";
import { listDrawings, type DrawingEntry } from "./drawing";

type Props = {
  /** a drawing picked: its path */
  onPick: (path: string) => void;
  /** a new drawing asked for */
  onNew: () => void;
};

/**
 * What to draw beside a note or a book: a new drawing, or one of `drawing/`,
 * the one beside marked.
 */
export default function DrawingChoices({ onPick, onNew }: Props) {
  const t = useT();
  const ws = useStore((s) => s.initDir);
  const current = useStore((s) => s.besideDrawing);
  const [drawings, setDrawings] = useState<DrawingEntry[]>();

  useEffect(() => {
    let cancelled = false;
    void listDrawings().then((list) => {
      if (!cancelled) setDrawings(list);
    });
    return () => {
      cancelled = true;
    };
  }, [ws]);

  return (
    <ul
      className="w-full p-1 overflow-y-auto menu menu-sm max-h-80"
      data-testid="drawing-choices"
    >
      <li>
        <button onClick={onNew}>
          <TbPlus size={16} className="text-teal-600" />
          {t("New Drawing")}
        </button>
      </li>
      {!drawings ? (
        <li className="flex items-center p-2">
          <Spinner size="sm" />
        </li>
      ) : drawings.length === 0 ? (
        <li className="px-3 py-1 text-sm opacity-60">{t("No drawing yet")}</li>
      ) : (
        drawings.map((d) => (
          <li key={d.path}>
            <button
              className={d.path === current ? "menu-active" : ""}
              title={d.path}
              onClick={() => onPick(d.path)}
            >
              <TbBrush size={16} className="shrink-0 opacity-60" />
              <span className="truncate">{d.name}</span>
            </button>
          </li>
        ))
      )}
    </ul>
  );
}
