import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { IconPlus } from "@tabler/icons-react";
import { genId } from "utils/helper";
import { openFilePath } from "file/open";
import { BaseModal } from "components/settings/BaseModal";
import { useCurrentViewContext } from "context/useCurrentView";
import { Column, Id, Card, KanbanData } from "./types";
import ColumnContainer from "./Column";
import TaskCard from "./Card";

interface Props {
  initData: KanbanData, 
  onKanbanChange: (columns: Column[], cards: Card[]) => void;
}

export default function KanbanBoard({initData, onKanbanChange}: Props) {
  const [columns, setColumns] = useState<Column[]>(initData.columns);
  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  const [tasks, setTasks] = useState<Card[]>(initData.cards);

  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [activeTask, setActiveTask] = useState<Card | null>(null);

  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  function createTask(columnId: Id) {
    const newTask: Card = {
      id: genId(),
      columnId,
      content: `Task ${tasks.length + 1}`,
    };
    const newTasks = [...tasks, newTask];

    setTasks(newTasks);
    // save to file
    onKanbanChange(columns, newTasks);
  }

  function deleteTask(id: Id) {
    const newTasks = tasks.filter((task) => task.id !== id);
    setTasks(newTasks);
    // save to file
    onKanbanChange(columns, newTasks);
  }

  function updateTask(id: Id, content: string) {
    const newTasks = tasks.map((task) => {
      if (task.id !== id) return task;
      return { ...task, content };
    });
  
    setTasks(newTasks);
    // save to file
    onKanbanChange(columns, newTasks);
  }

  function createNewColumn() {
    const columnToAdd: Column = {
      id: genId(),
      title: `Column ${columns.length + 1}`,
    };
    const newColumns = [...columns, columnToAdd];
    setColumns(newColumns);
    // save to file
    onKanbanChange(newColumns, tasks);
  }

  function deleteColumn(id: Id) {
    const filteredColumns = columns.filter((col) => col.id !== id);
    setColumns(filteredColumns);

    const newTasks = tasks.filter((t) => t.columnId !== id);
    setTasks(newTasks);
    // save to file
    onKanbanChange(filteredColumns, newTasks);
  }

  function updateColumn(id: Id, title: string) {
    const newColumns = columns.map((col) => {
      if (col.id !== id) return col;
      return { ...col, title };
    });

    setColumns(newColumns);
    // save to file
    onKanbanChange(newColumns, tasks);
  }

  function onDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === "Column") {
      setActiveColumn(event.active.data.current.column);
      return;
    }

    if (event.active.data.current?.type === "Task") {
      setActiveTask(event.active.data.current.task);
      return;
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveAColumn = active.data.current?.type === "Column";
    if (!isActiveAColumn) return;

    console.log("DRAG END");

    setColumns((columns) => {
      const activeColumnIndex = columns.findIndex((col) => col.id === activeId);
      const overColumnIndex = columns.findIndex((col) => col.id === overId);
      const newColumns = arrayMove(columns, activeColumnIndex, overColumnIndex);
      // save to file
      onKanbanChange(newColumns, tasks);

      return newColumns;
    });
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveATask = active.data.current?.type === "Task";
    const isOverATask = over.data.current?.type === "Task";

    if (!isActiveATask) return;

    // Im dropping a Task over another Task
    if (isActiveATask && isOverATask) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);

        let newTasks = [];
        if (tasks[activeIndex].columnId != tasks[overIndex].columnId) {
          tasks[activeIndex].columnId = tasks[overIndex].columnId;
          newTasks = arrayMove(tasks, activeIndex, overIndex - 1);
        } else {
          newTasks = arrayMove(tasks, activeIndex, overIndex);
        }

        // save to file
        onKanbanChange(columns, newTasks);

        return newTasks;
      });
    }

    const isOverAColumn = over.data.current?.type === "Column";

    // Im dropping a Task over a column
    if (isActiveATask && isOverAColumn) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);

        tasks[activeIndex].columnId = overId;
        console.log("DROPPING TASK OVER COLUMN", { activeIndex });
        const newTasks = arrayMove(tasks, activeIndex, activeIndex);
        // save to file
        onKanbanChange(columns, newTasks);

        return newTasks;
      });
    }
  }

  const [isColSetting, setIsColSetting] = useState(false);
  const [colSetting, setColSetting] = useState<Column | null>(null);
  function openSetCol(id: Id) {
    const checkColumn = columns.find((col) => col.id === id);
    if (!checkColumn) return;
    setColSetting(checkColumn);
    setIsColSetting(true);
  }

  function setColumnColor(id: Id, ty: string, color: string) {
    const newColumns = columns.map((col) => {
      if (col.id !== id) return col;
      if (ty === "bg") {
        return { ...col, bgColor: color };
      } else {
        return { ...col, ftColor: color };
      }
    });

    setColumns(newColumns);
    // save to file
    onKanbanChange(newColumns, tasks);
  }

  const [isCardSetting, setIsCardSetting] = useState(false);
  const [cardSetting, setCardSetting] = useState<Card | null>(null);
  function openSetCard(id: Id) {
    const check = tasks.find((card) => card.id === id);
    if (!check) return;
    setCardSetting(check);
    setIsCardSetting(true);
  }

  function setCardColor(id: Id, ty: string, color: string) {
    const newTasks = tasks.map((task) => {
      if (task.id !== id) return task;
      if (ty === "bg") {
        return { ...task, bgColor: color };
      } else {
        return { ...task, ftColor: color };
      }
    });

    setTasks(newTasks);
    // save to file
    onKanbanChange(columns, newTasks);
  }

  return (
    <div className="flex h-full w-full items-center overflow-x-auto overflow-y-hidden px-4">
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
      >
        <div className="m-auto flex gap-4">
          <div className="flex gap-4">
            <SortableContext items={columnsId}>
              {columns.map((col) => (
                <ColumnContainer
                  key={col.id}
                  column={col}
                  deleteColumn={deleteColumn}
                  updateColumn={updateColumn}
                  createTask={createTask}
                  deleteTask={deleteTask}
                  updateTask={updateTask}
                  openSetCol={openSetCol}
                  openSetCard={openSetCard}
                  tasks={tasks.filter((task) => task.columnId === col.id)}
                />
              ))}
            </SortableContext>
          </div>
          <button className="btn btn-neutral mt-[3rem]" onClick={createNewColumn} >
            <IconPlus />Add Column
          </button>
        </div>

        {createPortal(
          <DragOverlay>
            {activeColumn && (
              <ColumnContainer
                column={activeColumn}
                deleteColumn={deleteColumn}
                updateColumn={updateColumn}
                createTask={createTask}
                deleteTask={deleteTask}
                updateTask={updateTask}
                tasks={tasks.filter((task) => task.columnId === activeColumn.id)}
              />
            )}
            {activeTask && (
              <TaskCard
                task={activeTask}
                deleteTask={deleteTask}
                updateTask={updateTask}
              />
            )}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
      <BaseModal 
        title={`Column: ${colSetting?.title || ""}`} 
        isOpen={isColSetting} 
        handleClose={() => setIsColSetting(false)}
      >
        <div className="flex-1 p-2 bg-gray-100">
          <div className="flex flex-col items-center justify-center m-1">
            <span className="text-sm text-gray-600 mr-2">Background Color</span>
            <input 
              type="text" className="p-1 border-none outline-none"
              onChange={e => {setColumnColor(colSetting?.id || "", "bg", e.target.value)} } 
            />
          </div>
          <div className="flex flex-col items-center justify-center m-1">
            <span className="text-sm text-gray-600 mr-2">Font Color</span>
            <input 
              type="text" className="p-1 border-none outline-none"
              onChange={e => {setColumnColor(colSetting?.id || "", "ft", e.target.value)} } 
            />
          </div>
        </div>
      </BaseModal>
      <BaseModal 
        title={`Card: ${cardSetting?.content.substring(0, 24) || ""}`} 
        isOpen={isCardSetting} 
        handleClose={() => setIsCardSetting(false)}
      >
        <div className="flex-1 p-2 bg-gray-100 flex flex-col">
          <div className="flex flex-col items-start justify-start mb-4">
            {cardSetting?.items?.map(itm => (
              <button 
                key={itm.uri} 
                className="link py-2" 
                onClick={async () => {
                  await openFilePath(itm.uri, true);
                  dispatch({view: 'md', params: { noteId: itm.uri }});
                }}
              >{itm.name}</button>
            ))}
          </div>
          <div className="font-bold text-center">Set Color</div>
          <div className="flex flex-row items-center justify-center m-1">
            <span className="text-sm text-gray-600 mr-2">Background Color</span>
            <input 
              type="text" className="p-1 border-none outline-none"
              onChange={e => {setCardColor(cardSetting?.id || "", "bg", e.target.value)} } 
            />
          </div>
          <div className="flex flex-row items-center justify-center m-1">
            <span className="text-sm text-gray-600 mr-2">Font Color</span>
            <input 
              type="text" className="p-1 border-none outline-none"
              onChange={e => {setCardColor(cardSetting?.id || "", "ft", e.target.value)} } 
            />
          </div>
        </div>
      </BaseModal>
    </div>
  );
}
