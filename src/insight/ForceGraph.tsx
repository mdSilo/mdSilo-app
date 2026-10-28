// Modified from: https://github.com/churichard/notabase/blob/main/components/ForceGraph.tsx 
// GNU AFFERO GENERAL PUBLIC LICENSE Version 3

import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  Simulation,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from 'd3-force';
import { D3DragEvent, drag } from 'd3-drag';
import { zoom, zoomIdentity, zoomTransform, ZoomTransform } from 'd3-zoom';
import { select } from 'd3-selection';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { store, useStore, type NoteMap } from '@/state/store';
import { fromWorkspacePath } from '@/workspace/util';
import { annotationsPathOf } from '@/reader/annotations';
import { findBook, linkedBookIds } from '@/reader/bookLinks';
import { useLibraryBooks } from '@/reader/books';
import { useIssueData } from '@/issue/issueStore';
import { issueTexts, linkedNoteTitles } from '@/issue/refs';
import type { Issue } from '@/issue/types';
import { findBookPath, type BookEntry } from '@/reader/library';
import { noteTitleMap } from '@/lib/mdlink';
import { indexOf } from '@/lib/linkIndex';
import { openFilePath } from '@/workspace/open';
import { checkFileIsMd } from '@/workspace/process';

type GraphColors = {
  note: string;
  neighbor: string; // nodes linked to the hovered one, highlighted links
  hovered: string;
  tag: string;
  hoveredTag: string;
  book: string;
  bookLink: string; // a note linking a book
  spine: string;
  link: string;
  issue: string; // an open issue
  closedIssue: string;
  issueLink: string;
  background: string;
  text: string;
};

// fallbacks: no theme colors, e.g. in tests (Tailwind CSS v3 palette)
const LIGHT_COLORS: GraphColors = {
  note: '#86efac', neighbor: '#60a5fa', hovered: '#2563eb', tag: '#facc15',
  hoveredTag: '#ca8a04', book: '#38bdf8', bookLink: 'rgb(56 189 248 / 0.45)', spine: 'rgb(0 0 0 / 0.25)', link: '#e5e5e5', text: '#525252',
  issue: '#22c55e', closedIssue: 'rgb(115 115 115 / 0.5)', issueLink: 'rgb(34 197 94 / 0.45)', background: '#ffffff',
};
const DARK_COLORS: GraphColors = { ...LIGHT_COLORS, link: '#404040', text: '#f5f5f5', background: '#171717' };

/** Colors of the daisyUI theme applied on <html>, see useTheme */
function themeColors(): GraphColors {
  const root = document.documentElement;
  const fallback = root.classList.contains('dark') ? DARK_COLORS : LIGHT_COLORS;
  const style = getComputedStyle(root);
  const color = (name: string, alpha = 1) => {
    const value = style.getPropertyValue(name).trim();
    if (!value) return '';
    // e.g. oklch(76% 0.17 163) => oklch(76% 0.17 163 / 0.5)
    return alpha < 1 && value.endsWith(')') && !value.includes('/')
      ? `${value.slice(0, -1)} / ${alpha})`
      : value;
  };
  return {
    note: color('--color-primary', 0.55) || fallback.note,
    neighbor: color('--color-secondary') || fallback.neighbor,
    hovered: color('--color-secondary') || fallback.hovered,
    tag: color('--color-accent') || fallback.tag,
    hoveredTag: color('--color-warning') || fallback.hoveredTag,
    book: color('--color-info') || fallback.book,
    bookLink: color('--color-info', 0.45) || fallback.bookLink,
    spine: color('--color-info-content', 0.5) || fallback.spine,
    link: color('--color-base-content', 0.15) || fallback.link,
    issue: color('--color-success') || fallback.issue,
    closedIssue: color('--color-base-content', 0.4) || fallback.closedIssue,
    issueLink: color('--color-success', 0.45) || fallback.issueLink,
    background: color('--color-base-100') || fallback.background,
    text: color('--color-base-content', 0.8) || fallback.text,
  };
}

/** Theme colors, updated when the theme on <html> changes. */
function useThemeColors(): GraphColors {
  const [colors, setColors] = useState(themeColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(themeColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

export { HASHTAG_REGEX } from '@/lib/mdlink';

export type NodeDatum = {
  id: string;
  name: string;
  radius: number;
  ty: 'tag' | 'link' | 'book' | 'issue';
  /** a closed issue */
  closed?: boolean;
} & SimulationNodeDatum;

/** book: a note linking a book; annotation: a book and its annotations note */
export type LinkDatum = SimulationLinkDatum<NodeDatum> & {
  ty: 'tag' | 'link' | 'book' | 'annotation' | 'issue';
};

const BOOK_NODE_PREFIX = 'book:';
const bookNodeId = (hash: string) => `${BOOK_NODE_PREFIX}${hash}`;
const ISSUE_NODE_PREFIX = 'issue:';
const issueNodeId = (num: number) => `${ISSUE_NODE_PREFIX}${num}`;

export type GraphData = { nodes: NodeDatum[]; links: LinkDatum[] };

type DragEvent = D3DragEvent<HTMLCanvasElement, NodeDatum, NodeDatum>;

type Props = {
  className?: string;
};

export default function ForceGraph(props: Props) {
  const { className } = props;
  // console.log("fg loaded?");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transform = useRef(zoomIdentity);
  const hoveredNode = useRef<NodeDatum | null>(null);

  const colors = useThemeColors();
  const storeNotes = useStore((state) => state.notes);
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;
  const notes = useStore((state) => state.notes);

  const books = useLibraryBooks();
  const ws = useStore((state) => state.initDir);
  const { data: issueData } = useIssueData();
  const data: GraphData = useMemo(
    () => buildGraphData(notes, books, ws, issueData.issues),
    [notes, books, ws, issueData.issues]
  );

  const neighbors = useMemo(() => {
    const neighbors: Record<string, boolean> = {};
    for (const link of data.links) {
      const sourceId = isNodeDatum(link.source) ? link.source.id : link.source;
      const targetId = isNodeDatum(link.target) ? link.target.id : link.target;
      neighbors[`${sourceId}-${targetId}`] = true;
      neighbors[`${targetId}-${sourceId}`] = true;
    }
    return neighbors;
  }, [data.links]);

  const areNeighbors = useCallback(
    (nodeId1: string | undefined, nodeId2: string | undefined) => {
      if (!nodeId1 || !nodeId2) {
        return false;
      }
      return (
        neighbors[`${nodeId1}-${nodeId2}`] || neighbors[`${nodeId2}-${nodeId1}`]
      );
    },
    [neighbors]
  );

  const drawLink = useCallback(
    (context: CanvasRenderingContext2D, link: LinkDatum) => {
      const source = link.source;
      const target = link.target;

      if (
        !isNodeDatum(source) ||
        !isNodeDatum(target) ||
        !source.x ||
        !source.y ||
        !target.x ||
        !target.y
      ) {
        return;
      }

      const isSourceHovered = source.id === hoveredNode.current?.id;
      const isTargetHovered = target.id === hoveredNode.current?.id;
      const isLinkHighlighted = isSourceHovered || isTargetHovered;
      const isTag = link.ty === 'tag';

      // from edge to edge: not through the nodes, filled see-through
      const from = edgePoint(source, target.x, target.y);
      const to = edgePoint(target, source.x, source.y);
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      // overlapping nodes: nothing between them to draw
      if ((to.x - from.x) * dx + (to.y - from.y) * dy <= 0) {
        return;
      }

      context.save();

      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineWidth = link.ty === 'annotation' ? 1 : 0.5;
      context.lineCap = 'round';
      context.lineTo(to.x, to.y);
      if (isTag) {
        context.strokeStyle = 'transparent';
      } else if (isLinkHighlighted) {
        context.strokeStyle = colors.neighbor;
      } else if (link.ty === 'annotation') {
        context.strokeStyle = colors.book;
      } else if (link.ty === 'book') {
        context.strokeStyle = colors.bookLink;
      } else if (link.ty === 'issue') {
        context.strokeStyle = colors.issueLink;
      } else {
        context.strokeStyle = colors.link;
      }
      context.stroke();

      context.restore();
    },
    [colors]
  );

  const drawNode = useCallback(
    (context: CanvasRenderingContext2D, node: NodeDatum, scale: number) => {
      if (!node.x || !node.y) {
        return;
      }
      const isHovered = node.id === hoveredNode.current?.id;
      const isTag = node.ty === 'tag';
      const isBook = node.ty === 'book';
      const isIssue = node.ty === 'issue';
      const issueColor = node.closed ? colors.closedIssue : colors.issue;

      context.save();

      // Draw node: a book is a book, standing
      context.beginPath();
      if (isBook) {
        bookPath(context, node.x, node.y, node.radius);
      } else {
        context.moveTo(node.x + node.radius, node.y);
        context.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
      }

      // Fill node color
      if (isTag) {
        context.fillStyle = colors.tag;
      } else if (isBook) {
        context.fillStyle = colors.book;
      } else if (isIssue) {
        context.fillStyle = issueColor;
      } else if (areNeighbors(hoveredNode.current?.id, node.id)) {
        context.fillStyle = colors.neighbor;
      } else {
        context.fillStyle = colors.note;
      }

      if (isHovered) {
        context.strokeStyle = colors.hovered;
        context.stroke();
        context.fillStyle = isTag
          ? colors.hoveredTag
          : isBook ? colors.book : isIssue ? issueColor : colors.neighbor;
      }

      context.fill();

      if (isIssue) {
        // a ring with a dot, as the icon of an issue
        context.beginPath();
        context.arc(node.x, node.y, node.radius * 0.6, 0, 2 * Math.PI);
        context.fillStyle = colors.background;
        context.fill();
        context.beginPath();
        context.arc(node.x, node.y, node.radius * 0.25, 0, 2 * Math.PI);
        context.fillStyle = issueColor;
        context.fill();
      }

      if (isBook) {
        // the spine
        const { w, h } = bookSize(node.radius);
        context.beginPath();
        context.moveTo(node.x - w / 2 + w * 0.2, node.y - h / 2);
        context.lineTo(node.x - w / 2 + w * 0.2, node.y + h / 2);
        context.lineWidth = 0.6;
        context.strokeStyle = colors.spine;
        context.stroke();
      }

      // Add node text
      if (scale > 3) {
        context.globalAlpha = 1;
      } else if (scale > 2) {
        context.globalAlpha = 0.8;
      } else {
        context.globalAlpha = 0;
      }
      context.fillStyle = colors.text;
      context.font = `4px font-sans`;

      const lines = getLines(context, node.name, 50);
      let yPos = node.y + node.radius + 5;
      for (const line of lines) {
        const textWidth = context.measureText(line).width;
        context.fillText(line, node.x - textWidth / 2, yPos);
        yPos += 5;
      }

      context.restore();
    },
    [areNeighbors, colors]
  );

  const renderCanvas = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }

    const context = canvasRef.current.getContext('2d');
    if (!context) {
      return;
    }

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    context.save();
    context.clearRect(0, 0, width, height);

    const pixelRatio = window.devicePixelRatio;
    context.translate(
      transform.current.x * pixelRatio,
      transform.current.y * pixelRatio
    );
    context.scale(
      transform.current.k * pixelRatio,
      transform.current.k * pixelRatio
    );

    // Draw links
    for (const link of data.links) {
      drawLink(context, link);
    }

    // Draw nodes
    for (const node of data.nodes) {
      drawNode(context, node, transform.current.k * pixelRatio);
    }

    context.restore();
  }, [data, drawLink, drawNode]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const context = canvasRef.current.getContext('2d');
    if (!context) {
      return;
    }

    const pixelRatio = window.devicePixelRatio;
    const width = canvasRef.current.width / pixelRatio;
    const height = canvasRef.current.height / pixelRatio;

    const simulation: Simulation<NodeDatum, LinkDatum> =
      forceSimulation<NodeDatum>(data.nodes)
        .force(
          'link',
          forceLink<NodeDatum, LinkDatum>(data.links).id((d) => d.id)
        )
        .force(
          'collide',
          forceCollide<NodeDatum>().radius((node) => node.radius)
        )
        .force('charge', forceManyBody().strength(-60))
        .force('center', forceCenter(width / 2, height / 2))
        .force('x', forceX(width / 2))
        .force('y', forceY(height / 2));

    simulation.on('tick', () => renderCanvas());

    select<HTMLCanvasElement, NodeDatum>(context.canvas)
      .call(getDrag(simulation, context.canvas, hoveredNode))
      .call(
        zoom<HTMLCanvasElement, NodeDatum>()
          .scaleExtent([0.1, 10])
          .extent([
            [0, 0],
            [width, height],
          ])
          .on('zoom', ({ transform: t }: { transform: ZoomTransform }) => {
            transform.current = t;
            renderCanvas();
          })
      )
      .on('mousemove', (event) => {
        const { x, y } = getMousePos(context.canvas, event);
        const node = getNode(simulation, context.canvas, x, y);

        // Update mouse cursor and hovered node
        if (node) {
          context.canvas.style.cursor = 'pointer';
          hoveredNode.current = node;
          renderCanvas();
        } else if (hoveredNode.current) {
          context.canvas.style.cursor = 'default';
          hoveredNode.current = null;
          renderCanvas();
        }
      })
      .on('click', async (event) => {
        const { x, y } = getMousePos(context.canvas, event);
        const clickedNode = getNode(simulation, context.canvas, x, y);
        // Redirect to note when a node is clicked
        if (clickedNode && clickedNode.ty === 'link') {
          const note = storeNotes.get(clickedNode.id);
          if (!note) return;
          await openFilePath(note.id, true);
          dispatch({view: 'md', params: { noteId: note.id }});
        } else if (clickedNode?.ty === 'book') {
          const ws = store.getState().initDir;
          const hash = clickedNode.id.slice(BOOK_NODE_PREFIX.length);
          const path = ws ? await findBookPath(ws, hash) : undefined;
          if (path) dispatch({ view: 'book', path });
        } else if (clickedNode?.ty === 'issue') {
          dispatch({ view: 'issue', number: Number(clickedNode.id.slice(ISSUE_NODE_PREFIX.length)) });
        }
      });
  }, [data, dispatch, renderCanvas, storeNotes]);

  /**
   * Set canvas width and height when its container changes size
   */
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const containerRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      // Initialize resize observer
      if (!resizeObserverRef.current) {
        resizeObserverRef.current = new ResizeObserver((entries) => {
          if (!canvasRef.current) {
            return;
          }
          for (const entry of entries) {
            // Update canvas dimensions and re-render
            const cr = entry.contentRect;
            const scale = window.devicePixelRatio;
            canvasRef.current.width = Math.floor(cr.width * scale);
            canvasRef.current.height = Math.floor(cr.height * scale);
            renderCanvas();
          }
        });
      }

      if (containerRef.current) {
        // Unobserve and reset containerRef if it already exists
        resizeObserverRef.current?.unobserve(containerRef.current);
        containerRef.current = null;
      }

      if (node) {
        // Observe the new node and set containerRef
        resizeObserverRef.current?.observe(node);
        containerRef.current = node;

        // Set initial canvas width and height
        if (canvasRef.current) {
          const scale = window.devicePixelRatio;
          canvasRef.current.width = Math.floor(node.offsetWidth * scale);
          canvasRef.current.height = Math.floor(node.offsetHeight * scale);
        }
      }
    },
    [renderCanvas]
  );

  useEffect(() => {
    // Make sure that the resize observer is cleaned up when component is unmounted
    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRefCallback}
      className={`relative select-none ${className}`}
    >
      <canvas
        data-testid="graph-canvas"
        ref={canvasRef}
        className="absolute w-full h-full bg-base-100"
      />
    </div>
  );
}

/**
 * The nodes and links of the graph: the notes linking each other, their
 * tags, and the books they link to, each book linked to its annotations.
 */
export function buildGraphData(
  notes: NoteMap, books: Record<string, BookEntry> = {}, ws?: string, issues: Issue[] = []
): GraphData {
  const data: GraphData = { nodes: [], links: [] };
  // filter out the dir and non-md file
  const notesArr = notes.values().filter(n => !n.is_dir && checkFileIsMd(n.id));

  // Initialize linksByNoteId: {id: Set[ids]}
  const linksByNoteId: Record<string, Set<string>> = {};
  for (const note of notesArr) {
    linksByNoteId[note.id] = new Set();
  }

  // initiate tag set
  const tagNames: Set<string> = new Set();
  // the books linked: node id -> the notes linking it
  const bookLinks = new Map<string, Set<string>>();
  const linkBook = (noteId: string, hash: string) => {
    const nodeId = bookNodeId(hash);
    linksByNoteId[noteId].add(nodeId);
    let ids = bookLinks.get(nodeId);
    if (!ids) bookLinks.set(nodeId, (ids = new Set()));
    ids.add(noteId);
  };
  // the issues linked: node id -> the nodes linked to it, notes and books
  const issueByNum = new Map(issues.map((i) => [i.number, i]));
  const issueLinks = new Map<string, Set<string>>();
  const linkIssue = (num: number, nodeId: string) => {
    if (!issueByNum.has(num)) return;
    const issueId = issueNodeId(num);
    let ids = issueLinks.get(issueId);
    if (!ids) issueLinks.set(issueId, (ids = new Set()));
    ids.add(nodeId);
  };
  // the annotations note of a book -> the book
  const bookOfAnnotations = new Map(
    ws ? Object.values(books).map((b) => [annotationsPathOf(fromWorkspacePath(ws, b.file)), b.hash]) : []
  );

  // title to note id, the first one if more than one note with same title
  const idByTitle = new Map<string, string>();
  for (const note of notesArr) {
    if (!idByTitle.has(note.title)) idByTitle.set(note.title, note.id);
  }
  // link title (including legacy `a_b` for `a b`) to note title
  const titleOf = noteTitleMap(idByTitle.keys());

  // links and tags of each note, from the index: parsed once per content
  const index = indexOf(notes);
  for (const note of notesArr) {
    // CASE []() and [[]]
    for (const link of index.rawLinks(note.id)) {
      const linkedTitle = titleOf.get(link);
      const linkedId = linkedTitle !== undefined ? idByTitle.get(linkedTitle) : undefined;
      if (linkedId && linkedId !== note.id) {
        linksByNoteId[note.id].add(linkedId);
        linksByNoteId[linkedId].add(note.id);
      }
    }
    // HashTag
    for (const tag of index.tags(note.id)) {
      tagNames.add(tag);
      // Add the tag to each note set
      linksByNoteId[note.id].add(tag);
    }
    // Books: linked, `book:` and `{{}}`, or annotated
    for (const ref of index.books(note.id)) {
      const book = findBook(books, ref);
      if (book) linkBook(note.id, book.hash);
    }
    const annotated = bookOfAnnotations.get(note.id);
    if (annotated) linkBook(note.id, annotated);
    // Issues: [#12](issue:12)
    for (const num of index.issues(note.id)) linkIssue(num, note.id);
  }

  // what the issues link: notes, explicitly or by title, and books
  for (const issue of issues) {
    for (const path of issue.notes) {
      if (linksByNoteId[path]) linkIssue(issue.number, path);
    }
    for (const text of issueTexts(issue)) {
      for (const title of linkedNoteTitles(text)) {
        const linkedTitle = titleOf.get(title);
        const noteId = linkedTitle !== undefined ? idByTitle.get(linkedTitle) : undefined;
        if (noteId) linkIssue(issue.number, noteId);
      }
      for (const hash of linkedBookIds(books, text)) {
        const nodeId = bookNodeId(hash);
        linkIssue(issue.number, nodeId);
        // a node of the book, even if no note links it
        if (!bookLinks.has(nodeId)) bookLinks.set(nodeId, new Set());
      }
    }
  }

  // links of the issues; the more linked, the bigger, the books too
  const issueLinksTo = new Map<string, number>();
  for (const [issueId, nodeIds] of issueLinks) {
    for (const nodeId of nodeIds) {
      data.links.push({ source: issueId, target: nodeId, ty: 'issue' });
      issueLinksTo.set(nodeId, (issueLinksTo.get(nodeId) ?? 0) + 1);
    }
    const issue = issueByNum.get(Number(issueId.slice(ISSUE_NODE_PREFIX.length)));
    data.nodes.push({
      id: issueId,
      name: `#${issue?.number} ${issue?.title ?? ''}`.trim(),
      radius: getRadius(nodeIds.size),
      ty: 'issue',
      ...(issue?.state === 'closed' ? { closed: true } : {}),
    });
  }

  // Create graph data
  for (const note of notesArr) {
    // Populate links
    const linkedIds = linksByNoteId[note.id].values(); // including notes and tags
    // the book of the annotations note, if it is one
    const annotatedHash = bookOfAnnotations.get(note.id);
    const annotated = annotatedHash ? bookNodeId(annotatedHash) : undefined;
    const numOfLinks = linksByNoteId[note.id].size;
    for (const linkedId of linkedIds) {
      data.links.push({ 
        source: note.id, 
        target: linkedId, 
        ty: tagNames.has(linkedId)
          ? 'tag'
          : bookLinks.has(linkedId)
            ? (annotated === linkedId ? 'annotation' : 'book')
            : 'link',
      });
    }
    // Populate nodes
    data.nodes.push({
      id: note.id,
      name: note.title,
      radius: getRadius(numOfLinks + (issueLinksTo.get(note.id) ?? 0)),
      ty: 'link',
    });
  }

  for (const [nodeId, noteIds] of bookLinks) {
    const book = books[nodeId.slice(BOOK_NODE_PREFIX.length)];
    data.nodes.push({
      id: nodeId,
      name: book?.title ?? nodeId,
      radius: getRadius(noteIds.size + (issueLinksTo.get(nodeId) ?? 0)),
      ty: 'book',
    });
  }

  // update tag nodes to data.nodes
  for (const tag of tagNames) {
    // Populate nodes
    data.nodes.push({
      id: tag,
      name: `#${tag}`,
      radius: 4,
      ty: 'tag',
    });
  }

  return data;
}

/** The size of a book node: a cover, taller than wide, about as big as a note. */
const bookSize = (radius: number) => ({ w: radius * 1.5, h: radius * 2 });

/** The path of a book node: a cover, its corners rounded a little. */
function bookPath(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const { w, h } = bookSize(radius);
  const r = Math.min(w, h) * 0.12;
  const left = x - w / 2;
  const top = y - h / 2;
  context.moveTo(left + r, top);
  context.lineTo(left + w - r, top);
  context.quadraticCurveTo(left + w, top, left + w, top + r);
  context.lineTo(left + w, top + h - r);
  context.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
  context.lineTo(left + r, top + h);
  context.quadraticCurveTo(left, top + h, left, top + h - r);
  context.lineTo(left, top + r);
  context.quadraticCurveTo(left, top, left + r, top);
  context.closePath();
}

/**
 * Where the line from the node toward (x, y) leaves it: on its circle, or on
 * the cover of a book.
 */
export function edgePoint(node: NodeDatum, x: number, y: number) {
  const cx = node.x ?? 0;
  const cy = node.y ?? 0;
  const dx = x - cx;
  const dy = y - cy;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: cx, y: cy };
  let distance = node.radius;
  if (node.ty === 'book') {
    // the side of the cover the line crosses first
    const { w, h } = bookSize(node.radius);
    distance = Math.min(
      dx ? (w / 2) * (length / Math.abs(dx)) : Infinity,
      dy ? (h / 2) * (length / Math.abs(dy)) : Infinity,
    );
  }
  return { x: cx + (dx / length) * distance, y: cy + (dy / length) * distance };
}

const getRadius = (numOfLinks: number) => {
  const MAX_RADIUS = 10;
  const BASE_RADIUS = 3;
  const LINK_MULTIPLIER = 0.5;
  return Math.min(BASE_RADIUS + LINK_MULTIPLIER * numOfLinks, MAX_RADIUS);
};

const isNodeDatum = (
  datum: string | number | NodeDatum
): datum is NodeDatum => {
  return typeof datum !== 'string' && typeof datum !== 'number';
};

const getMousePos = (canvas: HTMLCanvasElement, event: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

const getNode = (
  simulation: Simulation<NodeDatum, LinkDatum>,
  canvas: HTMLCanvasElement,
  canvasX: number,
  canvasY: number
) => {
  const transform = zoomTransform(canvas);
  const x = transform.invertX(canvasX);
  const y = transform.invertY(canvasY);
  const subject = simulation.find(x, y);
  if (
    subject &&
    subject.x &&
    subject.y &&
    Math.hypot(x - subject.x, y - subject.y) <= subject.radius
  ) {
    return subject;
  } else {
    return undefined;
  }
};

const getDrag = (
  simulation: Simulation<NodeDatum, LinkDatum>,
  canvas: HTMLCanvasElement,
  hoveredNode: MutableRefObject<NodeDatum | null>
) => {
  let initialDragPos: { x: number; y: number };

  function dragsubject(event: DragEvent) {
    return getNode(simulation, canvas, event.x, event.y);
  }

  function dragstarted(event: DragEvent) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    const subject = event.subject;
    if (!subject.x || !subject.y) {
      return;
    }
    initialDragPos = { x: subject.x, y: subject.y };
    subject.fx = subject.x;
    subject.fy = subject.y;

    hoveredNode.current = subject; // Show hover state
  }

  function dragged(event: DragEvent) {
    const transform = zoomTransform(canvas);
    event.subject.fx =
      initialDragPos.x + (event.x - initialDragPos.x) / transform.k;
    event.subject.fy =
      initialDragPos.y + (event.y - initialDragPos.y) / transform.k;
  }

  function dragended(event: DragEvent) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;

    hoveredNode.current = null; // Show hover state
  }

  return drag<HTMLCanvasElement, NodeDatum, NodeDatum | undefined>()
    .subject(dragsubject)
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
};

const getLines = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) => {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = context.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
};
