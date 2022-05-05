import { useMemo } from 'react';
// import { parser, serializer } from "mdsmirror";
import type { GraphData } from 'components/view/ForceGraph';
import ForceGraph from 'components/view/ForceGraph';
import { NoteTreeItem, useStore } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';

export default function Graph() {
  const notes = useStore((state) => state.notes);
  const noteTree = useStore((state) => state.noteTree);

  // Compute graph data
  const graphData: GraphData = useMemo(() => {
    const data: GraphData = { nodes: [], links: [] };
    const notesArr = Object.values(notes);

    // Initialize linksByNoteId: {id: Set[ids]}
    const linksByNoteId: Record<string, Set<string>> = {};
    for (const note of notesArr) {
      linksByNoteId[note.id] = new Set();
    }

    const genLinkPerNoteTree = (tree: NoteTreeItem[]) => {
      for (const item of tree) {
        const children = item.children;
        if (children.length > 0) {
          for (const child of children) {
            linksByNoteId[item.id].add(child.id);
            linksByNoteId[child.id].add(item.id);
            const subChildren = child.children;
            genLinkPerNoteTree(subChildren);
          }
        }
      }
    }

    // initiate tag set
    const tagNames: Set<string> = new Set();

    // Search for links and hashtags in each note
    for (const note of notesArr) {
      // TODO
    }

    // Update linksByNoteId per noteTree nested structure
    genLinkPerNoteTree(noteTree);

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
  }, [notes, noteTree]);

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
