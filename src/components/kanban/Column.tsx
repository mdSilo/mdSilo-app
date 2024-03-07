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
  createCard: (columnId: Id, content: string) => void;
  updateCard: (id: Id, content: string) => void;
  deleteCard: (id: Id) => void;
  cards: Card[];
  openSetCol?: (id: Id) => void;
  openSetCard?: (id: Id) => void;
}

export default function ColumnContainer({
  column,
  toDelColumn,
  updateColumn,
  createCard,
  cards,
  deleteCard,
  updateCard,
  openSetCol,
  openSetCard,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [mouseIsOver, setMouseIsOver] = useState(false);
  const [toAddCard, setToAddCard] = useState(false);
  const [cardContent, setCardContent] = useState("");

  const cardsIds = useMemo(() => {
    return cards.map((card) => card.id);
  }, [cards]);

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
        className="opacity-40 border-2 border-pink-500 w-[350px] h-[500px] flex flex-col"
      ></div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="w-[350px] max-h-[calc(100vh-5rem)] pb-2 my-2 rounded-md flex flex-col h-full"
    >
      {/* Column title */}
      <div
        {...attributes}
        {...listeners}
        onClick={() => {setEditMode(true);}}
        onMouseEnter={() => {setMouseIsOver(true);}}
        onMouseLeave={() => {setMouseIsOver(false);}}
        className="p-2 mb-2 text-xl h-[60px] cursor-grab rounded-md rounded-b-none font-bold flex items-center justify-between" 
        style={{color: column.ftColor || "white", backgroundColor: column.hdColor || "#40A3BF"}}
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
          <div className="flex flex-row">
            <button
              onClick={() => { toDelColumn(column.id);}}
              className="hover:bg-red-500 rounded p-1 w-8"
            >
              <IconTrash />
            </button>
            <button
              onClick={() => { openSetCol && openSetCol(column.id);}}
              className="hover:bg-green-500 rounded p-1 w-8" 
              title="Column Setting"
            >
              <IconTool />
            </button>
        </div>
        )}
      </div>
      {/* Column cards container */}
      <div className="flex flex-grow flex-col gap-2 p-1 overflow-x-hidden overflow-y-auto">
        <SortableContext items={cardsIds}>
          {cards.map((card) => (
            <TaskCard
              key={card.id}
              card={card}
              deleteCard={deleteCard}
              updateCard={updateCard}
              openSetCard={openSetCard}
            />
          ))}
        </SortableContext>
      </div>
      {/* Column footer */}
      <div className="flex flex-col">
        {toAddCard && (<textarea
          className="w-[95%] resize-none border-none rounded mx-auto my-1"
          placeholder="Type then Press Enter" 
          autoFocus 
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              createCard(column.id, cardContent);
              setToAddCard(false);
            }
          }}
          onChange={(e) => setCardContent(e.target.value)}
        />)}
        <button 
          className="border border-dashed border-green-400 text-white rounded hover:bg-sky-600 min-w-full my-2 px-2 flex items-center justify-center" 
          onClick={() => {setToAddCard(!toAddCard)}}
        >
          <IconPlus /> Add Card
        </button>
      </div>
    </div>
  );
}
