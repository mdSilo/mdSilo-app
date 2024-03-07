import { useState, useCallback, useEffect, useMemo } from 'react';
import { useStore } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import KanbanBoard from 'components/kanban/Board';
import { Card, Column, Kanbans } from 'components/kanban/types';
import { joinPath } from 'file/util';
import FileAPI from 'file/files';

export default function Kanban() {
  const initDir = useStore((state) => state.initDir);
  const currentKanban = useStore((state) => state.currentBoard);
  const setCurrentKanban = useStore((state) => state.setCurrentBoard);
  const [kanbans, setKanbans] = useState<Kanbans>({});

  // console.log("currentKanban", currentKanban, kanbans);

  useEffect(() => {
    const kanbanJsonPath = initDir ? joinPath(initDir, `kanban.json`) : '';
    if (kanbanJsonPath) {
      const jsonFile = new FileAPI(kanbanJsonPath);
      jsonFile.readFile().then(json => {
        const kanbans: Kanbans = JSON.parse(json || "{}");
        // console.log("effect Kanbans", kanbans);
        setKanbans(kanbans);
      });
    }
  }, [initDir]);

  const onKanbanChange = useCallback(
    async (columns: Column[], cards: Card[], bgColor?: string, bgImg?: string) => {
      const saveFile = new FileAPI('kanban.json', initDir);
      const name = currentKanban || "default";
      const oldData = kanbans[name];
      const newData = {
        columns, 
        cards, 
        bgColor: bgColor || oldData?.bgColor,
        bgImg: bgImg || oldData?.bgImg,
      };
      kanbans[name] = newData;
      // console.log("to save kanba", kanbans);
      await saveFile.writeFile(JSON.stringify(kanbans));
    },
    [currentKanban, initDir, kanbans]
  );

  const [newKanban, setNewKanban] = useState<string>("new kanban");

  const kanbanData = useMemo(() => {
    const name = currentKanban || "default";
    return kanbans[name] ?? {columns: [], cards: []};
  }, [currentKanban, kanbans]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col overflow-x-auto">
        <div className="flex w-full items-between justify-center px-4 my-2">
          {Object.keys(kanbans).map((k, index) => (
            <button 
              key={`k-${index}`} 
              className={`mr-2 text-xl hover:opacity-75 bg-gray-600 rounded px-1 ${k === currentKanban ? 'text-green-500' : 'text-white'}`}
              onClick={() => setCurrentKanban(k)}
            >{k}</button>
          ))}
          <input 
            type="text" 
            list="kanban-names"
            placeholder="Type to new board"
            className="block border-gray-200 rounded h-8 ml-2" 
            onChange={(ev) => {setNewKanban(ev.target.value);}}
            onKeyDown={(ev) => {
              if (ev.key !== "Enter") return;
              setCurrentKanban(newKanban);
            }} 
          />
          <datalist id="kanban-names">
            {Object.keys(kanbans).map((k, index) => (
              <option key={`k-${index}`} value={k}></option>
            ))}
          </datalist>
        </div>
        {kanbanData && (
          <KanbanBoard 
            key={`${currentKanban}-${kanbanData.cards.length}`} 
            initData={kanbanData} 
            onKanbanChange={onKanbanChange} 
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
