import { Descendant, Element } from 'slate';
import { v4 as uuidv4 } from 'uuid';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkToSlate from 'editor/serialization/remarkToSlate';
import wikiLinkPlugin from 'editor/serialization/wikilink/index';
import pubLinkPlugin from 'editor/serialization/publink/index';
import { store, Notes, NoteTreeItem, WikiTreeItem, NotesData } from 'lib/store';
import { getDefaultEditorValue } from 'editor/constants';
import { ciStringEqual, regDateStr } from 'utils/helper';
import { ElementType, NoteLink } from 'editor/slate';
import { Note, defaultNote } from 'types/model';
import { FileMetaData } from 'file/directory';

export function processJson(content: string) {
  const jsonNotesData = []; 
  
  try {
    const notesData: NotesData = JSON.parse(content);
    const notesObj: Notes = notesData.notesObj;
    const notesArr = Object.values(notesObj);
    notesArr.forEach(note => store.getState().upsertNote(note, false)); // not upsert tree here
    jsonNotesData.push(...notesArr);
    // not upsert tree when upsertNote because it will flatten nested structure
    // update tree from saved tree structure 
    const noteTree: NoteTreeItem[] = notesData.noteTree;
    noteTree.forEach(item => store.getState().updateNoteTree(item, null));
    const wikiTree: WikiTreeItem[] = notesData.wikiTree;
    wikiTree.forEach(item => store.getState().updateWikiTree(item.id, null));
    // TODO: json to mds and save locally
  } catch (e) {
    console.log(e);
    console.log("Please check the file, it must be the json you exported.")
  }
}

/**
 * on Process Mds: 
 * 0- procee txt to Descendant[],
 * 1- process Linking in content, create needed note; 
 * 2- save txt to File System;
 * 3- Store: set Descendant[] to store system of App 
 * 4- Upsert to db in some cases
 */
export function processMds(fileList: FileMetaData[]) {
  const upsertNote = store.getState().upsertNote;

  const noteTitleToIdCache: Record<string, string | undefined> = {};
  const newNotesData: Note[] = [];

  for (const file of fileList) {
    const fileName = file.file_name;
    const checkMd = checkFileIsMd(fileName);
    if (!fileName || !checkMd) {
      continue;
    }
    const fileContent = file.file_text;

    // process Markdown/txt to Descendant[]
    const { result } = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(wikiLinkPlugin, { aliasDivider: '|' })
      .use(pubLinkPlugin, { aliasDivider: '|' })
      .use(remarkToSlate)
      .processSync(fileContent);

    // process content and create new notes to which NoteLinks in content linked
    // newLinkedNote has and must has id and title only, w/ default content...
    // 
    // but ignore processing the PubLink to avoid using await on get wiki note id, 
    // will tackle the isssue of no-noteId on click: PubLinkElement 
    // 
    const { content: slateContent, newLinkedNoteArr: newLinkedNotes } =
      processNoteLinks(result as Descendant[], noteTitleToIdCache);

    // new note from file
    // Issue Alert: same title but diff ext, only one file can be imported
    const newNoteTitle = rmFileNameExt(fileName);
    
    const lastModDate = new Date(file.last_modified.secs_since_epoch * 1000).toISOString();
    const createdDate = new Date(file.created.secs_since_epoch * 1000).toISOString();
    const newNoteObj = {
      id: noteTitleToIdCache[newNoteTitle.toLowerCase()] ?? uuidv4(),
      title: newNoteTitle,
      content: slateContent.length > 0 ? slateContent : getDefaultEditorValue(),
      created_at: createdDate,
      updated_at: lastModDate,
      is_daily: regDateStr.test(newNoteTitle),
    };
    const newProcessedNote = {...defaultNote, ...newNoteObj};

    // save to title-id cache when new note from file: newProcessedNote
    noteTitleToIdCache[newNoteTitle.toLowerCase()] = newNoteObj.id;

    // Two type of note on process/import: 
    // 1- note imported from file (newProcessedNote) and 
    // 2- new created simple note on process NoteLink in content: newLinkedNote, {id, title};
    // sometimes, imported note has the same title to the noteTitle of NoteLink, 
    // here how to update the content of such note: 
    // 1- if newLinkedNote created on Process NoteLinks is pushed to newNotesData array before 
    // the newProcessedNote imported which has real content, can be updated when upsertNote.
    // 2- if the same note is already created from file, will not create note on processNoteLinks.
    // noteTitleToIdCache will record the created notes's title and id.
    //
    // upsert into store, order may matters:
    newLinkedNotes.forEach(simpleNote => upsertNote(simpleNote)); // upsert Simple Note first
    upsertNote(newProcessedNote); // upsert processed note with content later, good override
    // push to Array
    newNotesData.push(...newLinkedNotes);
    newNotesData.push(newProcessedNote);
  }

  return newNotesData;
}

/**
 * Refresh Import File
 * @param file
 * @returns 
 */
export const refreshImport = async (file: FileMetaData, title: string) => {
  // build title-id cache from store
  const noteTitleToIdCache: Record<string, string | undefined> = {};
  const notesArr = Object.values(store.getState().notes);
  const allNotes = notesArr.filter(n => !n.is_wiki);
  for (const note of allNotes) {
    noteTitleToIdCache[note.title.toLowerCase()] = note.id;
  }

  // if the file rename?
  const fileName = file.file_name;
  const checkMd = checkFileIsMd(fileName);
  if (!fileName || !checkMd) {
    return;
  }

  // toast.info("In sync with changes");

  const fileContent = file.file_text;

  // process Markdown/txt to Descendant[]
  const { result } = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(wikiLinkPlugin, { aliasDivider: '|' })
    .use(pubLinkPlugin, { aliasDivider: '|' })
    .use(remarkToSlate)
    .processSync(fileContent);

  // process content and create new notes to which NoteLinks in content linked
  // newLinkedNote has and must has id and title only, w/ default content...
  // new NoteLink may be added on modification even though 
  // the notes are already existing in most case, 
  const { content: slateContent, newLinkedNoteArr: newLinkedNotes } =
    processNoteLinks(result as Descendant[], noteTitleToIdCache);

  // new note from file
  const noteId = noteTitleToIdCache[title.toLowerCase()];
  if (!noteId) {
    return;
  }
  
  const lastModDate = new Date(file.last_modified.secs_since_epoch * 1000).toISOString();
  const createdDate = new Date(file.created.secs_since_epoch * 1000).toISOString();
  const newNoteObj = {
    id: noteId,
    title,
    content: slateContent.length > 0 ? slateContent : getDefaultEditorValue(),
    created_at: createdDate,
    updated_at: lastModDate,
  };
  const reProcessedNote: Note = {...defaultNote, ...newNoteObj};

  // upsert into store
  const upsertNote = store.getState().upsertNote;
  // can make sure that: the note existing in store will not be re-created.
  newLinkedNotes.forEach(simpleNote => upsertNote(simpleNote));
  upsertNote(reProcessedNote); // upsert processed note with content

  return reProcessedNote;
};

/** 
 *  Add the proper note id to the note links. 
 */
const processNoteLinks = (
  content: Descendant[],
  noteTitleToIdCache: Record<string, string | undefined> = {}
): { content: Descendant[]; newLinkedNoteArr: Note[] } => {
  const newLinkedNoteArr: Note[] = [];

  // Update note link elements with noteId
  const newContent = content.map((node) =>
    setNoteLinkIds(node, noteTitleToIdCache, newLinkedNoteArr)
  );

  return { content: newContent, newLinkedNoteArr };
};

/**
 * set noteId for NoteLink element
 * @param node 
 * @param noteTitleToIdCache 
 * @param newLinkedNoteArr 
 * @returns Descendant node
 */
const setNoteLinkIds = (
  node: Descendant,
  noteTitleToIdCache: Record<string, string | undefined>,
  newLinkedNoteArr: Note[]
): Descendant => {
  if (
    Element.isElement(node) && 
    !(node.type === ElementType.Table || node.type === ElementType.TableRow)
  ) {
    return {
      ...node,
      ...(node.type === ElementType.NoteLink
        ? { noteId: getNoteId(node, noteTitleToIdCache, newLinkedNoteArr) }
        : {}),
      children: node.children.map((child) =>
        setNoteLinkIds(child, noteTitleToIdCache, newLinkedNoteArr)
      ),
    };
  } else {
    return node;
  }
};

/**
 * get or new noteID that NoteLink element links to
 * @param node 
 * @param noteTitleToIdCache 
 * @param newLinkedNoteArr 
 * @returns noteId 
 */
const getNoteId = (
  node: NoteLink,
  noteTitleToIdCache: Record<string, string | undefined>,
  newLinkedNoteArr: Note[]
): string => {
  const noteTitle = node.noteTitle;
  const notesArr = Object.values(store.getState().notes);
  const notes = notesArr.filter(n => !n.is_wiki);

  const existingNoteId =
    noteTitleToIdCache[noteTitle.toLowerCase()] ??
    notes.find((note) => !note.is_wiki && ciStringEqual(note.title, noteTitle))?.id;
  
  let noteId;
  if (existingNoteId) {
    noteId = existingNoteId;
  } else {
    // Create new note from NoteLink, w/ id and title only
    // newLinkedNote here:
    noteId = uuidv4(); 
    const newLinkedNoteObj = {
      id: noteId, 
      title: noteTitle,
      is_daily: regDateStr.test(noteTitle),
    };
    newLinkedNoteArr.push({ 
      ...defaultNote,
      ...newLinkedNoteObj,
    });
  }
  // save to title-id cache when new note from NoteLink: newLinkedNote
  noteTitleToIdCache[noteTitle.toLowerCase()] = noteId;

  return noteId;
};

/* #endregion: import process */

/**
 * remove file name extension
 *
 * @param {string} fname, file name.
 */
export const rmFileNameExt = (fname: string) => {
  return fname.replace(/\.[^/.]+$/, '');
}

export const checkFileIsMd = (fname: string) => {
  const check = /\.(text|txt|md|mkdn|mdwn|mdown|markdown){1}$/i.test(fname);
  return check;
}
