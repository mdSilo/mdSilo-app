/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect } from 'react';
import { useStore } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import KanbanBoard from 'components/kanban/Board';
import { joinPath } from 'file/util';
import FileAPI from 'file/files';
import { Card, Column, KanbanData } from 'components/kanban/types';

export default function Kanban() {
  const initDir = useStore((state) => state.initDir);
  const [kanbanData, setKanbanData] = useState<KanbanData | null>(null);
  const kanbanJsonPath = initDir ? joinPath(initDir, `kanban.json`) : '';

  useEffect(() => {
    if (kanbanJsonPath) {
      const jsonFile = new FileAPI(kanbanJsonPath);
      jsonFile.readFile().then(json => {
        const data: KanbanData = JSON.parse(json);
        console.log("kanban", data);
        setKanbanData(data)
      });
    }
  }, [initDir, kanbanJsonPath]);

  const onKanbanChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (columns: Column[], cards: Card[]) => {
      const saveFile = new FileAPI('kanban.json', initDir);
      const newData = {columns, cards};
      await saveFile.writeFile(JSON.stringify(newData));
    },
    [initDir]
  );

  return (
    <ErrorBoundary>
      <div className="flex flex-1 overflow-x-auto">
        {kanbanData && (<KanbanBoard initData={kanbanData} onKanbanChange={onKanbanChange} />)}
      </div>
    </ErrorBoundary>
  );
}
