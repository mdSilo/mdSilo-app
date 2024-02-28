import { useMemo, useState } from "react";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconPlus, IconTool, IconTrash } from "@tabler/icons-react";
import { Column, Id, Card } from "./types";
import TaskCard from "./Card";

interface Props {
  column: Column;
  toDelColumn: (id: Id) => void;
  updateColumn: (id: Id, title: string) => void;
  createTask: (columnId: Id) => void;
  updateTask: (id: Id, content: string) => void;
  deleteTask: (id: Id) => void;
  tasks: Card[];
  openSetCol?: (id: Id) => void;
  openSetCard?: (id: Id) => void;
}

export default function ColumnContainer({
  column,
  toDelColumn,
  updateColumn,
  createTask,
  tasks,
  deleteTask,
  updateTask,
  openSetCol,
  openSetCard,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [mouseIsOver, setMouseIsOver] = useState(false);

  const tasksIds = useMemo(() => {
    return tasks.map((task) => task.id);
  }, [tasks]);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: {
      type: "Column",
      column,
    },
    disabled: editMode,
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
    backgroundColor: column.bgColor || "rgb(38 38 38)",
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-active opacity-40 border-2 border-pink-500 w-[350px] h-[500px] rounded-md flex flex-col"
      ></div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="w-[350px] h-full max-h-[calc(100vh-5rem)] pb-4 my-6 rounded-md flex flex-col"
    >
      {/* Column title */}
      <div
        {...attributes}
        {...listeners}
        onClick={() => {setEditMode(true);}}
        onMouseEnter={() => {setMouseIsOver(true);}}
        onMouseLeave={() => {setMouseIsOver(false);}}
        className="p-2 mb-2 text-lg h-[60px] cursor-grab rounded-md font-bold flex items-center justify-between" 
        style={{color: column.ftColor || "white", backgroundColor: column.hdColor || ""}}
      >
        <div className="flex gap-2 flex-1">
          {!editMode && column.title}
          {editMode && (
            <input
              className="bg-black focus:border-green-500 border rounded outline-none px-2"
              value={column.title}
              onChange={(e) => updateColumn(column.id, e.target.value)}
              autoFocus
              onBlur={() => { setEditMode(false); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                setEditMode(false);
              }}
            />
          )}
        </div>
        {mouseIsOver && (
          <div>
            <button
              onClick={() => { toDelColumn(column.id);}}
              className="stroke-gray-500 hover:stroke-white hover:bg-red-500 rounded px-1 py-2 w-8"
            >
              <IconTrash />
            </button>
            <button
              onClick={() => { openSetCol && openSetCol(column.id);}}
              className="stroke-gray-500 hover:stroke-white hover:bg-green-500 rounded px-1 py-2 w-8"
            >
              <IconTool />
            </button>
        </div>
        )}
      </div>
      {/* Column cards container */}
      <div className="flex flex-grow flex-col gap-2 p-2 overflow-x-hidden overflow-y-auto no-scrollbar">
        <SortableContext items={tasksIds}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              deleteTask={deleteTask}
              updateTask={updateTask}
              openSetCard={openSetCard}
            />
          ))}
        </SortableContext>
      </div>
      {/* Column footer */}
      <button 
        className="border border-dashed border-green-400 text-white rounded hover:bg-sky-600 min-w-full my-2" 
        onClick={() => {createTask(column.id);}}
      >
        <IconPlus />
      </button>
    </div>
  );
}
