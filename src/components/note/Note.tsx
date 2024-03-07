import React, { memo, useCallback, useMemo, useEffect, useRef, useState } from 'react';
import MsEditor, { JSONContent, Attach, embeds } from "mdsmirror";
import { invoke } from '@tauri-apps/api';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import copy from "copy-to-clipboard";
import { IconCaretRight } from '@tabler/icons-react';
import Title from 'components/note/Title';
import Toc, { Heading } from 'components/note/Toc';
import RawMarkdown from 'components/md/Markdown';
import { Mindmap } from 'components/mindmap/mindmap';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { updateCardLinks } from 'components/kanban/updateCard';
import { SidebarTab, store, useStore } from 'lib/store';
import type { Note as NoteType } from 'types/model';
import { defaultNote } from 'types/model';
import useNoteSearch from 'editor/hooks/useNoteSearch';
import { listDirPath } from 'editor/hooks/useOpen';
import { useCurrentViewContext } from 'context/useCurrentView';
import { ProvideCurrentMd } from 'context/useCurrentMd';
import { ciStringEqual, regDateStr, isUrl, decodeHTMLEntity, emitCustomEvent } from 'utils/helper';
import { imageExtensions, docExtensions } from 'utils/file-extensions';
import FileAPI from 'file/files';
import { writeFile, deleteFile, writeJsonFile } from 'file/write';
import { openFileDilog, openFilePath, openUrl, saveDilog } from 'file/open';
import { 
  joinPaths, getDirPath, setWindowTitle, normalizeSlash, getParentDir 
} from 'file/util';
import { getFileExt } from 'file/process';
import NoteHeader from './NoteHeader';
import Backlinks from './backlinks/Backlinks';
import updateBacklinks from './backlinks/updateBacklinks';


type Props = {
  noteId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  highlightedPath?: any; // TODO 
  className?: string;
};

function Note(props: Props) {
  const { noteId, className } = props;
  // console.log("loading",noteId)
  const [showBacklink, setShowBacklink] = useState(false);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const editorInstance = useRef<MsEditor>(null);
  const getHeading = () => {
    const hdings = editorInstance.current?.getHeadings();
    // console.log(hdings); 
    setHeadings(hdings ?? []);
  };

  useEffect(() => { getHeading(); }, [noteId]); // to trigger change on dep change 

  useEffect(() => {
    emitCustomEvent("PageLoaded", noteId);
  }, [noteId]);

  const darkMode = useStore((state) => state.darkMode);
  const font = useStore((state) => state.font);
  const fontSize = useStore((state) => state.fontSize);
  const fontWt = useStore((state) => state.fontWt);
  const lineHt = useStore((state) => state.lineHeight);
  const rawMode = useStore((state) => state.rawMode);
  const readMode = useStore((state) => state.readMode);
  const isRTL = useStore((state) => state.isRTL);
  const useAsset = useStore((state) => state.useAsset);
  
  const initDir = useStore((state) => state.initDir);
  const currentDir = useStore((state) => state.currentDir);

  // need to update timely if possible
  const protocol = navigator.platform.startsWith('Win') ? 'https://asset.localhost/' : 'asset://';

  // console.log("initDir", initDir, protocol, navigator.platform);
  const storeNotes = useStore((state) => state.notes);
  // get note and properties: title,  content value.... 
  const thisNote: NoteType = useStore((state) => state.currentNote[noteId]);
  const isDaily = thisNote?.is_daily ?? false;
  const title = thisNote?.title || '';
  const mdContent = thisNote?.content || ' '; // show ' ' if null 
  
  // const doc = parser.parse(mdContent);
  // console.log(">> doc: ", doc);
  // const json = getJSONContent(doc); 
  // console.log(">>json: ", json);
  
  const notePath = thisNote?.file_path;
  const shortNotePath = initDir && notePath 
    ? notePath.replace(initDir, normalizeSlash(initDir).split('/').pop() || '.')
    : notePath;

  // for context 
  const currentView = useCurrentViewContext();
  const state = currentView.state;
  const dispatch = currentView.dispatch;
  const currentNoteValue = useMemo(() => (
    { ty: 'note', id: noteId, state, dispatch }
  ), [dispatch, noteId, state]);

  // note action
  const deleteNote = useStore((state) => state.deleteNote);
  const upsertNote = useStore((state) => state.upsertNote);
  const upsertTree = useStore((state) => state.upsertTree);

  // write to local file
  const onContentChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (text: string, json: JSONContent) => {
      // console.log("on content change", text.length, json);
      await writeFile(notePath, text);
      // update TOC if any 
      getHeading();
    },
    [notePath]
  );

  const onMarkdownChange = useCallback(
    async (text: string) => {
      // console.log("on markdown content change", text);
      await writeFile(notePath, text);
    },
    [notePath]
  );

  setWindowTitle(`/ ${title} - mdSilo`, useStore((state) => state.isLoading));
  // update locally
  const onTitleChange = useCallback(
    async (newtitle: string) => {
      // update note title in storage as unique title
      const newTitle = newtitle.trim() || getUntitledTitle(noteId);
      const isTitleUnique = () => {
        const notesArr = Object.values(storeNotes);
        return notesArr.findIndex((n) => (n.title === newTitle)) === -1;
      };
      if (isTitleUnique()) {
        await updateBacklinks(title, newTitle); 
        // on rename file: 
        // 0- reload the old note to store.  
        await openFilePath(noteId, false);
        const oldPath = noteId;
        // 1- new FilePath
        const dirPath = await getDirPath(oldPath);
        const newPath = await joinPaths(dirPath, [`${newTitle}.md`]);
        // 2- swap value on disk: delete then write
        const swapContent = store.getState().notes[noteId]?.content || mdContent;
        await deleteFile(oldPath);
        await writeFile(newPath, swapContent);
        // 3- delete the old redundant in store before upsert note
        deleteNote(oldPath);
        // 4- update note in store
        const oldNote = storeNotes[noteId];
        const newNote = {
          ...oldNote,
          id: newPath,
          title: newTitle,
          file_path: newPath,
        };
        upsertNote(newNote);
        upsertTree(dirPath, [newNote]);
        await updateCardLinks(newPath, oldPath);
        // 5- nav to renamed note
        await openFilePath(newPath, true);
        dispatch({view: 'md', params: {noteId: newPath}});
        
        if (initDir) { 
          await writeJsonFile(initDir); 
        }
      }
    },
    [noteId, storeNotes, title, mdContent, deleteNote, upsertNote, upsertTree, dispatch, initDir]
  );

  // Search
  const onSearchText = useCallback(
    async (text: string, ty?: string) => {
      store.getState().setSidebarTab(SidebarTab.Search);
      store.getState().setSidebarSearchQuery(text);
      store.getState().setSidebarSearchType(ty || 'content');
      store.getState().setIsSidebarOpen(true);
    },
    []
  );

  // Search note
  const search = useNoteSearch({ numOfResults: 10 });
  const onSearchNote = useCallback(
    async (text: string) => {
      const results = search(text);
      const searchResults = results.map(res => {
        const itemTitle = res.item.title.trim();
        const search = {
          title: itemTitle,
          url: encodeURI(itemTitle), // used as [title](encodedTitle)
        };
        return search;
      });
      return searchResults;
    },
    [search]
  );

  // Create new note, return encoded title as url: [title](encoded title as url)
  const onCreateNote = useCallback(
    async (title: string) => {
      title = title.trim();
      const existingNote = Object.values(storeNotes).find((n) => (n.title === title));
      if (existingNote) {
        return encodeURI(existingNote.title.trim());
      }
      const parentDir = await getDirPath(notePath);
      await createNewNote(parentDir, title);
      
      return encodeURI(title);
    },
    [notePath, storeNotes]
  );

  // open link
  const onOpenLink = useCallback(
    async (href: string) => {
      if (isUrl(href)) { 
        await openUrl(href);
      } else {
        // find the note per title
        const title = decodeURI(href.trim()); 
        // ISSUE ALERT: 
        // maybe more than one notes with same title(ci), 
        // but only link to first searched one 
        const toNote = Object.values(storeNotes).find((n) => (n.title === title));
        if (!toNote) {
          // IF note is not existing, create new
          const parentDir = await getDirPath(notePath);
          const newNotePath = await createNewNote(parentDir, title);
          await openFilePath(newNotePath, true);
          dispatch({view: 'md', params: { noteId: newNotePath }});
          return;
        }
        await openFilePath(toNote.id, true);
        dispatch({view: 'md', params: { noteId: toNote.id }});
      }
    },
    [dispatch, notePath, storeNotes]
  );

  // attach file 
  const onAttachFile = useCallback(
    async (accept: string) => {
      const ext = accept === 'image/*' ? imageExtensions : docExtensions;
      const filePath = await openFileDilog(ext, false);
      if (filePath && typeof filePath === 'string') {
        let fullPath = filePath;
        let fileUrl = filePath;
        // console.log("use asset", useAsset)
        if (initDir && useAsset) {
          const assetPath = await invoke<string[]>(
            'copy_file_to_assets', { srcPath: filePath, workDir: initDir }
          );
          // console.log("asset path", assetPath)
          fullPath = assetPath[0] || filePath;
          // now it is relative path
          fileUrl = encodeURI(assetPath[1] || filePath);
        } else {
          fileUrl = accept === 'image/*' 
            ? convertFileSrc(filePath)
            : encodeURI(filePath);
        }
        // console.log("file url", fileUrl)
        const fileInfo = new FileAPI(fullPath);
        if (await fileInfo.exists()) {
          const fileMeta = await fileInfo.getMetadata();
          const fname = fileMeta.file_name;
          const fileExt = getFileExt(fname);
          const attach: Attach = {
            type: accept === 'image/*' ? `image/${fileExt}` : fileExt,
            name: fname,
            size: fileMeta.size,
            src:  fileUrl,
          };
          return [attach];
        }
      }
      return [];
    },
    [initDir, useAsset]
  );

   // open Attachment file using defult application 
  const onClickAttachment = useCallback(async (href: string) => {
    const realHref = href.startsWith('./') && initDir
      ? href.replace('.', initDir)
      : href;
    // console.log("file href", href, decodeURI(realHref), initDir);
    await openUrl(decodeURI(realHref));
  }, [initDir]);

  const onSaveDiagram = useCallback(async (svg: string, ty: string) => {
    if (!initDir) return;
    const rawSVG = decodeHTMLEntity(svg);
    const fname = `${title.trim().replaceAll(' ', '-') || 'untitled'}-${ty}.svg`
    const dir = await saveDilog(fname);
    const defaultDir = `${initDir}/mindmap/${fname}`;
    const saveDir = normalizeSlash(dir || defaultDir); 
    await writeFile(saveDir, rawSVG);
  }, [initDir, title]);

  // copy heading hash or hashtag hash
  const onCopyHash = useCallback(
    (hash: string) => { copy(`${title}${hash}`); }, [title]
  );

  const customTheme = {
    fontFamily: `${font}`,
    fontScale: [fontSize / 1.1, lineHt / 1.6, fontWt / 400],
  };

  const noteContainerClassName =
    'flex flex-col w-full bg-white dark:bg-black dark:text-gray-200';
  const errorContainerClassName = 
    `${noteContainerClassName} items-center justify-center h-full p-4`;

  const isNoteExists = useMemo(() => !!storeNotes[noteId], [noteId, storeNotes]);

  if (!isNoteExists) {
    return (
      <div className={errorContainerClassName}>
        <p>The note does not exist: {noteId}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className={errorContainerClassName}>
          <p>An unexpected error occurred when rendering this note.</p>
        </div>
      }
    >
      <ProvideCurrentMd value={currentNoteValue}>
        <div id={noteId} className={`${noteContainerClassName} ${className}`}>
          <NoteHeader setShowBacklink={setShowBacklink} />
          <div className="flex flex-col flex-1 overflow-x-hidden overflow-y-auto">
            <div className="flex flex-col flex-1 w-full mx-auto px-8 md:px-12">
              <div
                className="px-2 pb-1 text-slate-500 text-sm cursor-pointer"
                onClick={async (e) => {
                  e.preventDefault();
                  const parentDir: string = await getParentDir(notePath);
                  if (parentDir === currentDir) return;
                  await listDirPath(parentDir, false);
                }}
              >
                {shortNotePath}
              </div>
              <Title
                className="px-2 pb-1"
                initialTitle={title}
                onChange={onTitleChange}
                isDaily={isDaily}
              />
              {(rawMode === 'wysiwyg') && headings.length > 0 
                ? (<Toc headings={headings} />) 
                : null
              }
              <div className="flex-1 px-2 pt-2 pb-8" id="note-content">
                {rawMode === 'raw' ? (
                  <RawMarkdown
                    key={`raw-${title}`}
                    initialContent={mdContent}
                    onChange={onMarkdownChange}
                    dark={darkMode}
                    readMode={readMode}
                    className={"text-xl"}
                  />
                ) : rawMode === 'mindmap' ? (
                  <Mindmap 
                    key={`mp-${noteId}`} 
                    title={title} 
                    mdValue={mdContent} 
                    initDir={initDir} 
                  />
                ) : (
                  <MsEditor 
                    key={`wys-${noteId}`}
                    ref={editorInstance}
                    value={mdContent}
                    dark={darkMode}
                    readOnly={readMode}
                    readOnlyWriteCheckboxes={readMode}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    theme={customTheme}
                    onChange={onContentChange}
                    onSearchLink={onSearchNote}
                    onCreateLink={onCreateNote}
                    onSearchSelectText={(txt) => onSearchText(txt)}
                    onClickHashtag={(txt) => onSearchText(txt, 'hashtag')}
                    onOpenLink={onOpenLink} 
                    attachFile={onAttachFile} 
                    onClickAttachment={onClickAttachment} 
                    onSaveDiagram={onSaveDiagram} 
                    onCopyHash={onCopyHash}
                    embeds={embeds}
                    disables={['sub']}
                    rootPath={initDir}
                    protocol={protocol}
                  />
                )}
              </div>
              <button
                className="inline-flex items-center p-1 mt-2 group"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBacklink(!showBacklink);
                }}
              >
                <IconCaretRight
                  className={`mr-1 text-gray-500 dark:text-gray-200 ${showBacklink ? 'rotate-90' : ''}`}
                  size={16}
                  fill="currentColor"
                />
                  BackLinks
              </button>
              <div className="pt-2 border-t-2 border-gray-200 dark:border-gray-600">
                {showBacklink ? (<Backlinks className="mx-4 mb-8" isCollapse={false} />) : null}
              </div>
            </div>
          </div>
        </div>
      </ProvideCurrentMd>
    </ErrorBoundary>
  );
}

export default memo(Note);

// Get a unique "Untitled" title, ignoring the specified noteId.
const getUntitledTitle = (noteId: string) => {
  const title = 'Untitled';

  const getResult = () => (suffix > 0 ? `${title} ${suffix}` : title);

  let suffix = 0;
  const notesArr: NoteType[] = Object.values(store.getState().notes);
  while (
    notesArr.findIndex(
      (note) =>
        note?.id !== noteId &&
        ciStringEqual(note?.title, getResult())
    ) > -1
  ) {
    suffix += 1;
  }

  return getResult();
};

const createNewNote = async (parentDir: string, title: string) => {
  const notePath = await joinPaths(parentDir, [`${title}.md`]);
  const newNote = { 
    ...defaultNote, 
    id: notePath, 
    title,
    file_path: notePath,
    is_daily: regDateStr.test(title),
  };
  store.getState().upsertNote(newNote);
  store.getState().upsertTree(parentDir, [newNote]);
  await writeFile(notePath, ' ');

  return notePath;
};
