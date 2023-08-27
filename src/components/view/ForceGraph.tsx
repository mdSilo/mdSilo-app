// Modified from: https://github.com/churichard/notabase/blob/main/components/ForceGraph.tsx 
// GNU AFFERO GENERAL PUBLIC LICENSE Version 3

import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import colors from 'tailwindcss/colors';
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
import { useCurrentViewContext } from 'context/useCurrentView';
import { useStore } from 'lib/store';
import { isUrl } from 'utils/helper';
import { openFilePath } from 'file/open';
import { checkFileIsMd } from 'file/process';

export const LINK_REGEX = /\[([^[]+)]\((\S+)\)/g;
export const WIKILINK_REGEX = /\[\[(.+)\]\]/g;
export const HASHTAG_REGEX = /\s#(.+)#\s/g;

export type NodeDatum = {
  id: string;
  name: string;
  radius: number;
  ty: 'tag' | 'link';
} & SimulationNodeDatum;

export type LinkDatum = SimulationLinkDatum<NodeDatum> & { ty: 'tag' | 'link' };

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

  const darkMode = useStore((state) => state.darkMode);
  const storeNotes = useStore((state) => state.notes);
  const currentView = useCurrentViewContext();
  const dispatch = currentView.dispatch;
  const notes = useStore((state) => state.notes);

  // Compute graph data
  const data: GraphData = useMemo(() => {
    const data: GraphData = { nodes: [], links: [] };
    // filter out the dir and non-md file
    const notesArr = Object.values(notes).filter(n => !n.is_dir && checkFileIsMd(n.id));

    // Initialize linksByNoteId: {id: Set[ids]}
    const linksByNoteId: Record<string, Set<string>> = {};
    for (const note of notesArr) {
      linksByNoteId[note.id] = new Set();
    }

    // initiate tag set
    const tagNames: Set<string> = new Set();

    // Search for links in each note 
    for (const note of notesArr) {
      // CASE []()
      const link_array: RegExpMatchArray[] = [...note.content.matchAll(LINK_REGEX)];
      for (const match of link_array) {
        const href = match[2];
        if (!isUrl(href)) {
          const title = decodeURI(href);
          const existingNote = notesArr.find(n => (n.title === title));
          if (existingNote) {
            linksByNoteId[note.id].add(existingNote.id);
            linksByNoteId[existingNote.id].add(note.id);
          }
        }
      }
      // CASE [[]]
      const wiki_array: RegExpMatchArray[] = [...note.content.matchAll(WIKILINK_REGEX)];
      for (const match of wiki_array) {
        const href = match[1];
        if (!isUrl(href)) {
          const title = href;
          const existingNote = notesArr.find(n => (n.title === title));
          if (existingNote) {
            linksByNoteId[note.id].add(existingNote.id);
            linksByNoteId[existingNote.id].add(note.id);
          }
        }
      }
      // HashTag
      const tag_array: RegExpMatchArray[] = [...note.content.matchAll(HASHTAG_REGEX)];
      for (const match of tag_array) {
        const tag = match[1]?.trim();
        if (tag && !tag.includes('#')) {
          tagNames.add(tag);
          // Add the tag to each note set
          linksByNoteId[note.id].add(tag);
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
        radius: 4,
        ty: 'tag',
      });
    }

    return data;
  }, [notes]);

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

      context.save();

      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineWidth = 0.5;
      context.lineTo(target.x, target.y);
      if (isTag) {
        context.strokeStyle = 'transparent';
      } else if (isLinkHighlighted) {
        context.strokeStyle = colors.blue[400];
      } else if (darkMode) {
        context.strokeStyle = colors.neutral[700];
      } else {
        context.strokeStyle = colors.neutral[200];
      }
      context.stroke();

      context.restore();
    },
    [darkMode]
  );

  const drawNode = useCallback(
    (context: CanvasRenderingContext2D, node: NodeDatum, scale: number) => {
      if (!node.x || !node.y) {
        return;
      }
      const isHovered = node.id === hoveredNode.current?.id;
      const isTag = node.ty === 'tag';

      context.save();

      // Draw node
      context.beginPath();
      context.moveTo(node.x + node.radius, node.y);
      context.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);

      // Fill node color
      if (isTag) {
        context.fillStyle = colors.yellow[400];
      } else if (areNeighbors(hoveredNode.current?.id, node.id)) {
        context.fillStyle = colors.blue[400];
      } else {
        context.fillStyle = colors.green[300];
      }

      if (isHovered) {
        context.strokeStyle = colors.blue[600];
        context.stroke();
        context.fillStyle = isTag ? colors.yellow[600] : colors.blue[400];
      }

      context.fill();

      // Add node text
      if (scale > 3) {
        context.globalAlpha = 1;
      } else if (scale > 2) {
        context.globalAlpha = 0.8;
      } else {
        context.globalAlpha = 0;
      }
      context.fillStyle = darkMode
        ? colors.neutral[100]
        : colors.neutral[600];
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
    [areNeighbors, darkMode]
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
          const note = storeNotes[clickedNode.id];
          if (!note) return;
          await openFilePath(note.id, true);
          dispatch({view: 'md', params: { noteId: note.id }});
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
        className="absolute w-full h-full dark:bg-gray-900"
      />
    </div>
  );
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
