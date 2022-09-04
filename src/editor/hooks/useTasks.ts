import { useMemo, useEffect } from 'react';
import { parser, Task, getTasks } from "mdsmirror";
import { Notes, useStore } from 'lib/store';
import { loadDir } from 'file/open';
import { Note } from 'types/model';

export type DocTask = {
  note: Note;
  tasks: Task[];
};

export default function useTasks() {
  const isLoaded = useStore((state) => state.isLoaded);
  const setIsLoaded = useStore((state) => state.setIsLoaded);
  const initDir = useStore((state) => state.initDir);
  // console.log("tk loaded?", isLoaded);
  useEffect(() => {
    if (!isLoaded && initDir) {
      loadDir(initDir).then(() => setIsLoaded(true));
    }
  }, [initDir, isLoaded, setIsLoaded]);
  
  const notes = useStore((state) => state.notes);

  const docTasks = useMemo(
    () => computeTasks(notes),
    [notes]
  );

  return docTasks;
}

export const computeTasks = (notes: Notes): DocTask[] => {
  const result: DocTask[] = [];
  const notesArr = Object.values(notes);
  const myNotes = notesArr.filter(n => !n.is_wiki);
  for (const note of myNotes) {
    const tasks = computeNoteTasks(note.content);
    if (tasks.length > 0) {
      result.push({ note, tasks });
    }
  }
  return result;
};

const computeNoteTasks = (content: string) => {
  const doc = parser.parse(content);
  // console.log(">> doc: ", doc, content)
  const tasks = getTasks(doc); 
  
  return tasks;
};
