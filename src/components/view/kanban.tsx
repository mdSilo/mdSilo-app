/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect } from 'react';
import Board from 'react-trello';
import { useStore } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { joinPath } from 'file/util';
import FileAPI from 'file/files';

export default function Kanban() {
  const initDir = useStore((state) => state.initDir);
  const [kanbanData, setKanbanData] = useState<any>({lanes: []});
  const kanbanJsonPath = initDir ? joinPath(initDir, `kanban.json`) : '';

  useEffect(() => {
    if (kanbanJsonPath) {
      const jsonFile = new FileAPI(kanbanJsonPath);
      jsonFile.readJSONFile().then(json => setKanbanData(json));
    }
  }, [initDir, kanbanJsonPath]);

  const onKanbanChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (newData: any) => {
      const saveFile = new FileAPI('kanban.json', initDir);
      await saveFile.writeFile(JSON.stringify(newData));
      setKanbanData(newData);
    },
    [initDir]
  );

  return (
    <ErrorBoundary>
      <div className="h-full">
        <div className="p-1">
          <Board
            // style={{backgroundColor: "rgb(138, 146, 153)"}}
            data={kanbanData}
            draggable
            editable
            canAddLanes
            editLaneTitle 
            collapsibleLanes
            id="kanban"
            onDataChange={onKanbanChange}
            onCardDelete={() => {/**/}}
            onCardAdd={() => {/**/}}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}
