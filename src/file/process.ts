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
import { FileMetaData, SimpleFileMeta } from 'file/directory';

export function processJson(content: string): boolean {
  try {
    const notesData: NotesData = JSON.parse(content);
    const notesObj: Notes = notesData.notesObj;
    const noteTree: NoteTreeItem[] = notesData.noteTree;
    const wikiTree: WikiTreeItem[] = notesData.wikiTree || [];
    if (notesObj && noteTree) {
      // restore notes from saved data 
      store.getState().setNotes(notesObj);
      // restore note tree from saved tree hierarchy
      store.getState().setNoteTree(noteTree);
      store.getState().setWikiTree(wikiTree);
      // TODO: json to mds and save locally
      return true;
    } else {
      return false;
    }
  } catch (e) {
    console.log("Please check the JSON file: ", e);
    return false;
  }
}

export function preProcessMds(fileList: SimpleFileMeta[]) {
  const upsertNote = store.getState().upsertNote;

  const newPreNotesData: Note[] = [];

  for (const file of fileList) {
    const fileName = file.file_name;
    const checkMd = checkFileIsMd(fileName);
    if (!fileName || !checkMd) {
      continue;
    }

    // new note from file
    // Issue Alert: same title but diff ext, only one file can be imported
    const newNoteTitle = rmFileNameExt(fileName);
    
    const lastModDate = new Date(file.last_modified.secs_since_epoch * 1000).toISOString();
    const createdDate = new Date(file.created.secs_since_epoch * 1000).toISOString();
    const newNoteObj = {
      id: uuidv4(), // placeholder only
      title: newNoteTitle,
      content: getDefaultEditorValue(), // placeholder only
      created_at: createdDate,
      updated_at: lastModDate,
      is_daily: regDateStr.test(newNoteTitle),
      not_process: true,
      file_path: file.file_path,
    };
    const newPreProcessedNote = {...defaultNote, ...newNoteObj};
  
    upsertNote(newPreProcessedNote); // upsert processed note with content later, good override
    // push to Array
    newPreNotesData.push(newPreProcessedNote);
  }

  return newPreNotesData;
}

/**
 * on Process Mds: 
 * 0- procee txt to Descendant[],
 * 1- process Linking in content, create needed note; 
 * 2- save txt to File System;
 * 3- Store: set Descendant[] to store system of App 
 */
export function processMds(fileList: FileMetaData[]) {
  const upsertNote = store.getState().upsertNote;

  let noteTitleToIdCache: Record<string, string | undefined> = {};
  // init Title-ID cache per store
  const storeCache = store.getState().noteTitleToIdMap;
  noteTitleToIdCache = {...storeCache};

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
      not_process: false,
      file_path: file.file_path,
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
const rmFileNameExt = (fname: string) => {
  return fname.replace(/\.[^/.]+$/, '');
}

const checkFileIsMd = (fname: string) => {
  const check = /\.(text|txt|md|mkdn|mdwn|mdown|markdown){1}$/i.test(fname);
  return check;
}
