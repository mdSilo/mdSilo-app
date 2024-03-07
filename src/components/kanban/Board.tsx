import { useCallback, useMemo, useState } from "react";
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
import { IconCircle, IconCircleX } from "@tabler/icons-react";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { genId } from "utils/helper";
import { imageExtensions } from "utils/file-extensions";
import { openFileDilog, openFilePath, openUrl } from "file/open";
import { BaseModal } from "components/settings/BaseModal";
import { useCurrentViewContext } from "context/useCurrentView";
import { Column, Id, Card, KanbanData } from "./types";
import ColumnContainer from "./Column";
import TaskCard from "./Card";

interface Props {
  initData: KanbanData, 
  onKanbanChange: (columns: Column[], cards: Card[], color?: string, img?: string) => void;
}

export default function KanbanBoard({initData, onKanbanChange}: Props) {
  const [columns, setColumns] = useState<Column[]>(initData.columns);
  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  const [cards, setCards] = useState<Card[]>(initData.cards);
  const [bgColor, setBgColor] = useState(initData.bgColor);
  const [bgImg, setBgImg] = useState(initData.bgImg);

  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);

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

  function createCard(columnId: Id, content?: string) {
    const newCard: Card = {
      id: genId(),
      columnId,
      content: content || `Card ${cards.length + 1}`,
    };
    const newCards = [...cards, newCard];

    setCards(newCards);
    // save to file
    onKanbanChange(columns, newCards);
  }

  function deleteCard(id: Id) {
    const newCards = cards.filter((card) => card.id !== id);
    setCards(newCards);
    // save to file
    onKanbanChange(columns, newCards);
  }

  function updateCard(id: Id, content: string) {
    const newCards = cards.map((card) => {
      if (card.id !== id) return card;
      return { ...card, content };
    });
  
    setCards(newCards);
    // save to file
    onKanbanChange(columns, newCards);
  }

  function createNewColumn() {
    const columnToAdd: Column = {
      id: genId(),
      title: `Column ${columns.length + 1}`,
    };
    const newColumns = [...columns, columnToAdd];
    setColumns(newColumns);
    // save to file
    onKanbanChange(newColumns, cards);
  }

  const [showDelColumn, setShowDelColumn] = useState(false);
  const [toDelColumn, setToDelColumn] = useState<Id | null>(null);
  function openDelColumn(id: Id) {
    setToDelColumn(id);
    setShowDelColumn(true);
  }

  function deleteColumn() {
    const filteredColumns = columns.filter((col) => col.id !== toDelColumn);
    setColumns(filteredColumns);

    const newCards = cards.filter((t) => t.columnId !== toDelColumn);
    setCards(newCards);
    // save to file
    onKanbanChange(filteredColumns, newCards);
    setShowDelColumn(false);
  }

  function updateColumn(id: Id, title: string) {
    const newColumns = columns.map((col) => {
      if (col.id !== id) return col;
      return { ...col, title };
    });

    setColumns(newColumns);
    // save to file
    onKanbanChange(newColumns, cards);
  }

  function onDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === "Column") {
      setActiveColumn(event.active.data.current.column);
      return;
    }

    if (event.active.data.current?.type === "Card") {
      setActiveCard(event.active.data.current.card);
      return;
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveCard(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveAColumn = active.data.current?.type === "Column";
    if (!isActiveAColumn) return;

    // console.log("DRAG END");

    setColumns((columns) => {
      const activeColumnIndex = columns.findIndex((col) => col.id === activeId);
      const overColumnIndex = columns.findIndex((col) => col.id === overId);
      const newColumns = arrayMove(columns, activeColumnIndex, overColumnIndex);
      // save to file
      onKanbanChange(newColumns, cards);

      return newColumns;
    });
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveACard = active.data.current?.type === "Card";
    const isOverACard = over.data.current?.type === "Card";

    if (!isActiveACard) return;

    // Im dropping a Card over another Card
    if (isActiveACard && isOverACard) {
      setCards((cards) => {
        const activeIndex = cards.findIndex((t) => t.id === activeId);
        const overIndex = cards.findIndex((t) => t.id === overId);

        let newCards = [];
        if (cards[activeIndex].columnId != cards[overIndex].columnId) {
          cards[activeIndex].columnId = cards[overIndex].columnId;
          newCards = arrayMove(cards, activeIndex, overIndex - 1);
        } else {
          newCards = arrayMove(cards, activeIndex, overIndex);
        }

        // save to file
        onKanbanChange(columns, newCards);

        return newCards;
      });
    }

    const isOverAColumn = over.data.current?.type === "Column";

    // Im dropping a Card over a column
    if (isActiveACard && isOverAColumn) {
      setCards((cards) => {
        const activeIndex = cards.findIndex((t) => t.id === activeId);

        cards[activeIndex].columnId = overId;
        // console.log("DROPPING CARD OVER COLUMN", { activeIndex });
        const newCards = arrayMove(cards, activeIndex, activeIndex);
        // save to file
        onKanbanChange(columns, newCards);

        return newCards;
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
      } else if (ty === "head") {
        return { ...col, hdColor: color };
      } else {
        return { ...col, ftColor: color };
      }
    });

    setColumns(newColumns);
    // save to file
    onKanbanChange(newColumns, cards);
  }

  const [isCardSetting, setIsCardSetting] = useState(false);
  const [cardSetting, setCardSetting] = useState<Card | null>(null);
  function openSetCard(id: Id) {
    const check = cards.find((card) => card.id === id);
    if (!check) return;
    setCardSetting(check);
    setIsCardSetting(true);
  }

  function setCardColor(id: Id, ty: string, color: string) {
    const newCards = cards.map((card) => {
      if (card.id !== id) return card;
      if (ty === "bg") {
        return { ...card, bgColor: color };
      } else {
        return { ...card, ftColor: color };
      }
    });

    setCards(newCards);
    // save to file
    onKanbanChange(columns, newCards);
  }

  function delCardItem(id: Id, itemUri: string) {
    const newCards = cards.map((card) => {
      if (card.id !== id) return card;
      const items = card.items || [];
      const newItems = items.filter(itm => itm.uri !== itemUri);
      const newCard = { ...card, items: newItems };
      setCardSetting(newCard);

      return newCard;
    });
  
    setCards(newCards);
    // save to file
    onKanbanChange(columns, newCards);
  }

  function setBoardBgColor(color?: string) {
    setBgColor(color);
    onKanbanChange(columns, cards, color, bgImg);
  }

  const setBoardBgImg = useCallback(
    async () => {
      const ext = imageExtensions;
      const filePath = await openFileDilog(ext, false);
      const img = filePath && typeof filePath === 'string'
        ? convertFileSrc(filePath)
        : "";
      setBgImg(img);
      onKanbanChange(columns, cards, bgColor, img);
    },
    [bgColor, columns, onKanbanChange, cards]
  );

  return (
    <div 
      className="flex h-full min-h-[calc(100vh-5rem)] w-full items-center overflow-x-auto overflow-y-hidden px-4"
      style={{
        backgroundColor: bgColor, 
        backgroundImage: `url(${bgImg})`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center center',
      }}
    >
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
      >
        <div className="mx-auto flex gap-2">
          <SortableContext items={columnsId}>
            {columns.map((col) => (
              <ColumnContainer
                key={col.id}
                column={col}
                toDelColumn={openDelColumn}
                updateColumn={updateColumn}
                createCard={createCard}
                deleteCard={deleteCard}
                updateCard={updateCard}
                openSetCol={openSetCol}
                openSetCard={openSetCard}
                cards={cards.filter((card) => card.columnId === col.id)}
              />
            ))}
          </SortableContext>
          <div className="flex flex-col items-start justify-start mt-[4rem]">
            <button 
              className="flex-none pop-btn h-8 min-w-24" 
              onClick={createNewColumn}
            >
              + Add Column
            </button>
            <button className="mt-2 flex-none pop-btn h-8 min-w-24" onClick={setBoardBgImg}>
              + Board Image
            </button>
            <input 
              type="color" 
              className="mt-2 border-none outline-none rounded" 
              title="Board Background Color"
              style={{width: '7em'}}
              value={bgColor}
              onChange={e => {setBoardBgColor(e.target.value);}} 
            />
          </div>
        </div>

        {createPortal(
          <DragOverlay>
            {activeColumn && (
              <ColumnContainer
                column={activeColumn}
                toDelColumn={openDelColumn}
                updateColumn={updateColumn}
                createCard={createCard}
                deleteCard={deleteCard}
                updateCard={updateCard}
                cards={cards.filter((card) => card.columnId === activeColumn.id)}
              />
            )}
            {activeCard && (
              <TaskCard
                card={activeCard}
                deleteCard={deleteCard}
                updateCard={updateCard}
              />
            )}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
      <BaseModal 
        title="Column"
        isOpen={isColSetting} 
        handleClose={() => setIsColSetting(false)}
      >
        <div className="flex-1 p-1 bg-gray-100">
          <div className="bg-gray-200 text-black rounded mb-2">{colSetting?.title || ""}</div>
          <div className="font-bold text-center">Set Color</div>
          <SetColor id={colSetting?.id || ""} setColor={setColumnColor} />
        </div>
      </BaseModal>
      <BaseModal 
        title="Card"
        isOpen={isCardSetting} 
        handleClose={() => setIsCardSetting(false)}
      >
        <div className="flex-1 p-1 bg-gray-100 flex flex-col">
          <div className="bg-gray-200 text-black rounded">{cardSetting?.content || ""}</div>
          <div className="flex flex-col items-start justify-start mb-4">
            {cardSetting?.items?.map(itm => (
              <div key={itm.uri} className="flex items-center justify-start w-full py-1">
                <button 
                  className="link flex-1 text-left mr-4" 
                  onClick={async () => {
                    if (itm.category === "note") {
                      await openFilePath(itm.uri, true);
                      dispatch({view: 'md', params: { noteId: itm.uri }});
                    } else {
                      await openUrl(itm.uri);
                    }
                  }}
                >{itm.name}</button>
                <button 
                  className="w-6 opacity-10 hover:opacity-100 hover:text-red-600" 
                  onClick={() => {delCardItem(cardSetting.id, itm.uri);}}
                ><IconCircleX size={18} /></button>
              </div>
            ))}
          </div>
          <div className="font-bold text-center">Set Color</div>
          <SetColor id={cardSetting?.id || ""} setColor={setCardColor} />
        </div>
      </BaseModal>
      <BaseModal 
        title="Delete This Column?" 
        isOpen={showDelColumn} 
        handleClose={() => setShowDelColumn(false)}
      >
        <div className="flex flex-col justify-center px-6">
          <button className="mt-2 font-bold text-red-600 pop-btn" onClick={deleteColumn}>
            Confirm Delete
          </button>
          <button className="mt-4 font-bold pop-btn" onClick={() => setShowDelColumn(false)}>
            Cancel Delete
          </button>
        </div>
      </BaseModal>
    </div>
  );
}

type SetProps = {
  id: Id;
  setColor: (id: Id, ty: string, color: string) => void;
}

function SetColor({id, setColor} : SetProps) {
  const colors = [
    "rgb(220 38 38)", "rgb(245 158 11)", "rgb(21 128 61)",
    "rgb(14 165 233)", "rgb(79 70 229)", "rgb(124 58 237)", 
  ];
  const [selectedTy, setSelectedTy] = useState("bg");

  return (
    <div className="flex flex-row items-center justify-between m-1">
      <select 
        name="select-ty" 
        className="w-full px-1 rounded text-primary-500 border-none"
        style={{width: '5em'}}
        value={selectedTy || 'bg'}
        onChange={(ev) => {setSelectedTy(ev.target.value);}}
      >
        {["bg", "head", "font"].map((t, index) => (
          <option key={`t-${index}`} value={t}>{t}</option>
        ))}
      </select>
      {colors.map((color, index) => (
        <button 
          key={`c-${index}`} 
          className="rounded-full m-1 hover:opacity-75"
          onClick={() => {setColor(id, selectedTy, color);}}
        ><IconCircle size={24} fill={color} /></button>
      ))}
      <input 
        type="color" 
        className="border-none outline-none" 
        style={{width: '3em'}}
        onChange={e => {setColor(id, selectedTy, e.target.value);}} 
      />
    </div>
  );
}
