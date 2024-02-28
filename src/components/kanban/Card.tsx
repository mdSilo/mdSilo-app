import { useCallback, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconFeather, IconPaperclip } from "@tabler/icons-react";
import { useStore } from "lib/store";
import { isMobile } from "utils/helper";
import { Id, Card } from "./types";

interface Props {
  task: Card;
  updateTask: (id: Id, content: string) => void;
  deleteTask?: (id: Id) => void;
  openSetCard?: (id: Id) => void;
}

export default function TaskCard({ task, updateTask, openSetCard }: Props) {
  const [mouseIsOver, setMouseIsOver] = useState(false);
  const [editMode, setEditMode] = useState(true);

  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsFindOrCreateModalOpen = useStore((state) => state.setIsFindOrCreateModalOpen);
  const setCurrentCard = useStore((state) => state.setCurrentCard);

  const onCreateNoteClick = useCallback((id: Id) => {
    if (isMobile()) { setIsSidebarOpen(false);}
    setIsFindOrCreateModalOpen((isOpen) => !isOpen);
    setCurrentCard(id);
  }, [setIsFindOrCreateModalOpen, setCurrentCard, setIsSidebarOpen]);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: "Task",
      task,
    },
    disabled: editMode,
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
    backgroundColor: task.bgColor || "rgb(64 64 64)",
  };

  const toggleEditMode = () => {
    setEditMode((prev) => !prev);
    setMouseIsOver(false);
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="p-2.5 h-[100px] items-center flex text-left rounded-xl border-2 border-green-500 cursor-grab relative"
      />
    );
  }

  if (editMode) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="p-2.5 h-[100px] min-h-[100px] items-center flex text-left rounded-xl hover:ring-2 hover:ring-inset hover:ring-green-500 cursor-grab relative"
      >
        <textarea
          className="h-[90%] w-full resize-none border-none rounded bg-transparent text-white focus:outline-none"
          value={task.content}
          autoFocus
          placeholder="Task content here"
          onBlur={toggleEditMode}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) {
              toggleEditMode();
            }
          }}
          onChange={(e) => updateTask(task.id, e.target.value)}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={toggleEditMode}
      className="p-2 h-[100px] items-center flex text-left rounded-xl hover:ring-2 hover:ring-inset hover:ring-green-500 cursor-grab relative rounded-xl"
      onMouseEnter={() => {setMouseIsOver(true);}}
      onMouseLeave={() => {setMouseIsOver(false);}}
    >
      <p 
        className="my-auto h-[90%] w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap no-scollbar"
        style={{color: task.ftColor || "white"}}
      >
        {task.content}
      </p>

      {mouseIsOver && (
        <div>
          <button
            onClick={() => {onCreateNoteClick(task.id);}}
            className="stroke-gray-500 hover:stroke-white hover:bg-primary-500 rounded px-1 py-2 w-8"
          >
            <IconFeather />
          </button>
          <button
              onClick={() => { openSetCard && openSetCard(task.id);}}
              className="stroke-gray-500 hover:stroke-white hover:bg-green-500 rounded px-1 py-2 w-8"
            >
              <IconPaperclip />
            </button>
        </div>
      )}
    </div>
  );
}
