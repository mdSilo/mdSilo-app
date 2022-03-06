import { ReactNode } from 'react';
import { RenderElementProps } from 'slate-react';
import classNames from 'classnames';
import { store } from 'lib/store';
import { Note } from 'types/model';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { useCurrentMdContext } from 'context/useCurrentMd';
import updateBacklinks from 'editor/backlinks/updateBacklinks';
import { PubLink } from 'editor/slate';
import Tooltip from 'components/misc/Tooltip';
import { loadDbWikiNotePerTitle } from 'lib/api/curdNote'
import { ciStringEqual } from 'utils/helper';
import { newWikiPerTitle } from 'editor/handleNoteId';

type PubLinkElementProps = {
  element: PubLink;
  children: ReactNode;
  attributes: RenderElementProps['attributes'];
  className?: string;
};

export default function PubLinkElement(props: PubLinkElementProps) {
  const { element, children, attributes, className } = props;

  const linkClassName = classNames(
    "link shadow-md p-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800", 
    className
  );
  const currentNote = useCurrentMdContext();
  const { onClick: onNoteLinkClick, defaultStackingBehavior } =
    useOnNoteLinkClick(currentNote.id);
  
  // Load wiki note first to get noteId if no noteId in Element, 
  //
  type returnWiki = {
    id: Note['id'] | null;
    note: Note | undefined;
  };
  //
  const getWikiNote = async (title: string, id: string): Promise<returnWiki> => {
    if (id.trim() && id.trim() !== title.trim()) {
      return {id, note: undefined};
    } else if (title.trim()) {
      // first lookup in store locally
      const wikiNotes = Object.values(store.getState().notes).filter(n => n.is_wiki);
      const existingWikiNote = wikiNotes.find((note) =>
        ciStringEqual(note.title, title) && note.is_wiki 
      );
      if (existingWikiNote) {
        return {id: existingWikiNote.id, note: existingWikiNote};
      }
      
      // then load from db
      const wikiNoteRes = await loadDbWikiNotePerTitle(title);
      const wikiNote = wikiNoteRes.data;
      // console.log("load note db", wikiNote);
      if (wikiNote) {
        store.getState().upsertNote(wikiNote);
        // update the real noteId to Element's noteId
        const newId = wikiNote.id;
        await updateBacklinks(title, title, newId);
        return {id: wikiNote.id, note: wikiNote};
      } else {
        // finally, new wiki Note, will upsertNote after new
        const note = await newWikiPerTitle(title) || undefined;
        return {id: note?.id || null, note};
      }
    }
    return {id: null, note: undefined};
  }

  return (
    <Tooltip
      content={<span className="break-words">{element.noteTitle}</span>}
      placement="bottom-start"
    >
      <span
        role="button"
        className={linkClassName}
        onClick={async (e) => {
          e.stopPropagation();
          const {id, note} = await getWikiNote(element.noteTitle, element.noteId);
          if (!id) return;
          onNoteLinkClick(id, defaultStackingBehavior(e), note);
        }}
        contentEditable={false}
        {...attributes}
      >
        {element.customText ?? element.noteTitle}
        {children}
      </span>
    </Tooltip>
  );
}
