import { useCallback, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconFeather, IconPaperclip, IconStack } from "@tabler/icons-react";
import { invoke } from '@tauri-apps/api';
import { useStore } from "lib/store";
import { isMobile } from "utils/helper";
import { openFileDilog } from "file/open";
import { docExtensions } from "utils/file-extensions";
import FileAPI from "file/files";
import { updateCardItems } from './updateCard';
import { Id, Card } from "./types";

interface Props {
  card: Card;
  updateCard: (id: Id, content: string) => void;
  deleteCard?: (id: Id) => void;
  openSetCard?: (id: Id) => void;
}

export default function TaskCard({ card, updateCard, openSetCard }: Props) {
  const [mouseIsOver, setMouseIsOver] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const initDir = useStore((state) => state.initDir);
  const setIsSidebarOpen = useStore((state) => state.setIsSidebarOpen);
  const setIsFindOrCreateModalOpen = useStore((state) => state.setIsFindOrCreateModalOpen);
  const setCurrentCard = useStore((state) => state.setCurrentCard);

  const onCreateNoteClick = useCallback((id: Id) => {
    if (isMobile()) { setIsSidebarOpen(false);}
    setIsFindOrCreateModalOpen((isOpen) => !isOpen);
    setCurrentCard(id);
  }, [setIsFindOrCreateModalOpen, setCurrentCard, setIsSidebarOpen]);

  const onAttachClick = useCallback(
    async () => {
      const ext = docExtensions;
      const filePath = await openFileDilog(ext, false);
      if (filePath && typeof filePath === 'string') {
        let fileUrl = filePath;
        // console.log("use asset", useAsset)
        if (initDir) {
          const assetPath = await invoke<string[]>(
            'copy_file_to_assets', { srcPath: filePath, workDir: initDir }
          );
          // console.log("asset path", assetPath)
          fileUrl = assetPath[0] || filePath;
        }

        const fileInfo = new FileAPI(fileUrl);
        if (await fileInfo.exists()) {
          const fileMeta = await fileInfo.getMetadata();
          const fname = fileMeta.file_name;
          updateCardItems(card.id, [fname, fileUrl]);
          // FIXME: update the items state 
        }
      }
    },
    [card.id, initDir]
  );

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: {
      type: "Card",
      card,
    },
    disabled: editMode,
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
    backgroundColor: card.bgColor || "rgb(64 64 64)",
    color: card.ftColor || "white",
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
        className="p-2 h-[80px] flex text-left border-2 border-green-500 cursor-grab relative"
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
        className="p-2 h-[100px] items-center flex text-left hover:ring-2 hover:ring-inset hover:ring-purple-500 relative"
      >
        <textarea
          className="h-[90%] w-full resize-none border-none rounded bg-transparent" 
          autoFocus 
          value={card.content}
          onBlur={toggleEditMode}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) {
              toggleEditMode();
            }
          }}
          onChange={(e) => updateCard(card.id, e.target.value)}
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
      className="p-2 h-[100px] min-h-[100px] items-center flex text-left rounded hover:ring-2 hover:ring-inset hover:ring-green-500 cursor-grab relative"
      onMouseEnter={() => {setMouseIsOver(true);}}
      onMouseLeave={() => {setMouseIsOver(false);}}
    >
      <p className="my-auto h-[90%] w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap">
        {card.content}
      </p>

      {mouseIsOver && (
        <div className="flex flex-row">
          <button
            onClick={() => {onCreateNoteClick(card.id);}}
            className="hover:bg-primary-500 rounded p-1 w-8"
            title="Link Note"
          >
            <IconFeather />
          </button>
          <button
              onClick={onAttachClick}
              className="hover:bg-blue-500 rounded p-1 w-8 hidden"
            >
              <IconPaperclip />
          </button>
          <button
              onClick={() => { openSetCard && openSetCard(card.id);}}
              className="hover:bg-green-500 rounded p-1 w-8" 
              title="Card Modal"
            >
              <IconStack />
          </button>
        </div>
      )}
    </div>
  );
}
