import { useEffect, useMemo } from 'react';
// import { parser, serializer } from "mdsmirror";
import ErrorBoundary from 'components/misc/ErrorBoundary';
import type { GraphData } from 'components/view/ForceGraph';
import ForceGraph from 'components/view/ForceGraph';
import { useStore } from 'lib/store';
import { ciStringEqual, isUrl } from 'utils/helper';
import { loadDir } from 'file/open';

export const LINK_REGEX = /\[([^[]+)]\((\S+)\)/g;

export default function Graph() {
  const isLoaded = useStore((state) => state.isLoaded);
  const setIsLoaded = useStore((state) => state.setIsLoaded);
  const initDir = useStore((state) => state.initDir);
  // console.log("loaded?", isLoaded);
  useEffect(() => {
    if (!isLoaded && initDir) {
      loadDir(initDir).then(() => setIsLoaded(true));
    }
  }, [initDir, isLoaded, setIsLoaded]);

  const notes = useStore((state) => state.notes);

  // Compute graph data
  const graphData: GraphData = useMemo(() => {
    const data: GraphData = { nodes: [], links: [] };
    const notesArr = Object.values(notes).filter(n => !n.is_dir && !n.is_wiki);

    // Initialize linksByNoteId: {id: Set[ids]}
    const linksByNoteId: Record<string, Set<string>> = {};
    for (const note of notesArr) {
      linksByNoteId[note.id] = new Set();
    }

    // initiate tag set, TODO
    const tagNames: Set<string> = new Set();

    // Search for links in each note
    for (const note of notesArr) {
      const link_array: RegExpMatchArray[] = [...note.content.matchAll(LINK_REGEX)];
      for (const match of link_array) {
        const href = match[2];
        if (!isUrl(href)) {
          const title = href.replaceAll('_', ' ');
          const existingNote = notesArr.find(n => ciStringEqual(n.title, title));
          if (existingNote) {
            linksByNoteId[note.id].add(existingNote.id);
            linksByNoteId[existingNote.id].add(note.id);
          }
        }
      }
    }

    // Create graph data
    for (const note of notesArr) {
      // Populate links
      const linkedIds = linksByNoteId[note.id].values(); // including notes and tags
      const numOfLinks = linksByNoteId[note.id].size;
      for (const linkedId of linkedIds) {
        data.links.push({ 
          source: note.id, 
          target: linkedId, 
          ty: tagNames.has(linkedId) ? 'tag' : 'link', 
        });
      }
      // Populate nodes
      data.nodes.push({
        id: note.id,
        name: note.title,
        radius: getRadius(numOfLinks),
        ty: 'link',
      });
    }

    // update tag nodes to data.nodes
    for (const tag of tagNames) {
      // Populate nodes
      data.nodes.push({
        id: tag,
        name: `#${tag}`,
        radius: 3,
        ty: 'tag',
      });
    }

    return data;
  }, [notes]);

  return (
    <ErrorBoundary>
      <ForceGraph data={graphData} className="flex-1" />
    </ErrorBoundary>
  );
}

const getRadius = (numOfLinks: number) => {
  const MAX_RADIUS = 10;
  const BASE_RADIUS = 3;
  const LINK_MULTIPLIER = 0.5;
  return Math.min(BASE_RADIUS + LINK_MULTIPLIER * numOfLinks, MAX_RADIUS);
};
