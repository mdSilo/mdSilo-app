import { store } from 'lib/store';
import { joinPath } from 'file/util';
import FileAPI from 'file/files';
import { rmFileNameExt } from 'file/process';
import { Id, KanbanData, CardItem, Kanbans } from './types';

/**
 * Upsert the note in kanban card
 * 
 * @param noteId of current note, aka filePath or [title, filePath]
 * @param oldTitle of current note, to rename
 */
export const updateCardItems = async (
  id: Id, noteId: string | string[], oldTitle?: string
) => {
  const initDir = store.getState().initDir;
  const currentKb = store.getState().currentBoard;
  // console.log("currentKb", currentKb);
  if (!initDir || !currentKb.trim()) return;

  const [title, itemUri, category] = typeof noteId === "string" 
    ? [noteId.split("/").pop(), noteId, "note"]
    : [...noteId, "attach"];
  if (!title) return;

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
    // console.log("old title in card: ", oldTitle)
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
  // reset current card
  store.getState().setCurrentCard(undefined);
};


export const updateCardLinks = async (newPath: string, oldPath: string) => {
  const initDir = store.getState().initDir;
  if (!initDir) return;

  const oldTitle = oldPath.split("/").pop();
  const newTitle = newPath.split("/").pop();
  if (!oldTitle || !newTitle) return;

  const kanbanJsonPath = joinPath(initDir, `kanban.json`);
  const jsonFile = new FileAPI(kanbanJsonPath);
  const json0 = await jsonFile.readFile();
  // just replace
  //const oldItem = String.raw`{\"name\":\"${oldTitle}\",\"uri\":\"${oldPath}\",\"category\":\"note\"}`;
  //const newItem = String.raw`{\"name\":\"${newTitle}\",\"uri\":\"${newPath}\",\"category\":\"note\"}`;
  //const json = json0.replaceAll(oldItem, newItem);
  const json1 = json0.replaceAll(oldTitle, newTitle);
  const json = json1.replaceAll(oldPath, newPath);

  await jsonFile.writeFile(json);
};
