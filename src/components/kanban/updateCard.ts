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
const updateCard = async (id: Id, noteId: string | string[], oldTitle?: string) => {
  const initDir = store.getState().initDir;
  const currentKb = store.getState().currentBoard;
  console.log("currentKb", currentKb);
  if (!initDir || !currentKb.trim()) return;

  const [title, itemUri, category] = typeof noteId === "string" 
    ? [noteId.split("/").pop() || noteId, noteId, "note"]
    : [...noteId, "attach"];
  const kanbanJsonPath = joinPath(initDir, `kanban.json`);
  const jsonFile = new FileAPI(kanbanJsonPath);
  const json = await jsonFile.readFile();
  const kanbans: Kanbans = JSON.parse(json);
  const data: KanbanData = kanbans[currentKb];

  const cards = data.cards;
  const newCards = cards.map((card) => {
    if (card.id !== id) return card;

    const items = card.items || [];
    const newItem: CardItem = {
      name: title,
      uri: itemUri,
      category,
    };
    console.log("old title in card: ", oldTitle)
    if (oldTitle) {
      // filter out old one
      const newItems = items.filter(itm => rmFileNameExt(itm.name) !== oldTitle);
      // console.log("items in card: ", newItems);
      newItems.push(newItem);

      return { ...card, items: newItems };
    } else {
      // push new item
      items.push(newItem);
      
      return { ...card, items };
    }
  });

  // update and save to file
  data.cards = newCards;
  kanbans[currentKb] = data;
  await jsonFile.writeFile(JSON.stringify(kanbans));
};

export default updateCard;
