import { store } from 'lib/store';
import { joinPath } from 'file/util';
import FileAPI from 'file/files';
import { rmFileNameExt } from 'file/process';
import { Id, KanbanData, CardItem, Kanbans } from './types';

/**
 * Upsert the note in kanban card
 * 
 * @param noteId of current note, aka filePath
 * @param oldTitle of current note, to rename
 */
const updateCard = async (id: Id, noteId: string, oldTitle?: string) => {
  const initDir = store.getState().initDir;
  const currentKb = store.getState().currentBoard;
  console.log("currentKb", currentKb);
  if (!initDir || !currentKb.trim()) return;

  const title = noteId.split("/").pop() || noteId;
  const kanbanJsonPath = joinPath(initDir, `kanban.json`);
  const jsonFile = new FileAPI(kanbanJsonPath);
  const json = await jsonFile.readFile();
  const kanbans: Kanbans = JSON.parse(json);
  const data: KanbanData = kanbans[currentKb];

  const cards = data.cards;
  const newTasks = cards.map((task) => {
    if (task.id !== id) return task;

    const items = task.items || [];
    const newItem: CardItem = {
      name: title,
      uri: noteId,
      category: "note",
    };
    console.log("old title in card: ", oldTitle)
    if (oldTitle) {
      // filter out old one
      const newItems = items.filter(itm => rmFileNameExt(itm.name) !== oldTitle);
      // console.log("items in card: ", newItems);
      newItems.push(newItem);

      return { ...task, items: newItems };
    } else {
      // push new item
      items.push(newItem);
      
      return { ...task, items };
    }
  });

  // update and save to file
  data.cards = newTasks;
  kanbans[currentKb] = data;
  await jsonFile.writeFile(JSON.stringify(kanbans));
};

export default updateCard;
