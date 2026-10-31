import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampPosition, columnsOf, isRulerKey, lineBoxesOf, moveDirection, moveRuler, rulerFilter, rulerPadding, rulerSize,
  setRulerMover, snapColumns, snapColumnsToAnchor, snapToAnchor, snapToLines, stepPosition, visibleLines,
} from './ruler';

// ported from readup's reading-ruler tests

describe('the size and place of the band', () => {
  it('is the lines of the text, by font size and line height', () => {
    expect(rulerSize(2, { fontSize: 18, lineHeight: 1.4 })).toBe(50);
  });

  it('has room of 0.3 of a line on each side', () => {
    // round(16 * 1.5 * 0.3) = 7
    expect(rulerPadding({ fontSize: 16, lineHeight: 1.5 })).toBe(7);
  });

  it('keeps the whole band in the view', () => {
    expect(clampPosition(5, 1000, 200)).toBe(10);
    expect(clampPosition(95, 1000, 200)).toBe(90);
    expect(clampPosition(33, 1000, 200)).toBe(33);
  });

  it('is centered when larger than the view', () => {
    expect(clampPosition(10, 100, 120)).toBe(50);
    expect(clampPosition(90, 100, 120)).toBe(50);
  });

  it('steps by its size with no lines to go by, within the view', () => {
    expect(stepPosition(33, 1000, 200, 'forward')).toBe(53);
    expect(stepPosition(33, 1000, 200, 'backward')).toBe(13);
    expect(stepPosition(85, 1000, 200, 'forward')).toBe(90);
    expect(stepPosition(15, 1000, 200, 'backward')).toBe(10);
  });

  it('tints by a hue of each color', () => {
    expect(rulerFilter('green', 0.6)).toBe('sepia(0.6) saturate(2) hue-rotate(70deg) brightness(1)');
    expect(rulerFilter('yellow', 0.5)).toContain('hue-rotate(0deg)');
  });
});

describe('the clicks and keys that move it', () => {
  afterEach(() => setRulerMover('main', undefined));

  it('goes back to the left, forward to the left in a book written right to left', () => {
    expect(moveDirection('right', 'ltr')).toBe('forward');
    expect(moveDirection('left', 'ltr')).toBe('backward');
    expect(moveDirection('right', 'rtl')).toBe('backward');
    expect(moveDirection('left', 'rtl')).toBe('forward');
    expect(moveDirection('down', 'rtl')).toBe('forward');
    expect(moveDirection('up', 'ltr')).toBe('backward');
  });

  it('moves by up and down only, written down the page; by all the arrows across', () => {
    expect(isRulerKey('up', true)).toBe(true);
    expect(isRulerKey('down', true)).toBe(true);
    expect(isRulerKey('left', true)).toBe(false);
    expect(isRulerKey('right', true)).toBe(false);
    expect(isRulerKey('left', false)).toBe(true);
    expect(isRulerKey('right', false)).toBe(true);
  });

  it('asks the ruler of the pane, if shown; a click on a side even written down the page', () => {
    expect(moveRuler('main', 'down', { vertical: false, key: true })).toBe(false);
    const mover = vi.fn(() => true);
    setRulerMover('main', mover);
    expect(moveRuler('side', 'down', { vertical: false, key: true })).toBe(false);
    expect(moveRuler('main', 'left', { dir: 'rtl', vertical: true, key: true })).toBe(false);
    expect(moveRuler('main', 'left', { dir: 'rtl', vertical: true, key: false })).toBe(true);
    expect(mover).toHaveBeenLastCalledWith('forward');
  });
});

type RectLike = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};

const rect = (top: number, left: number, height: number, width: number): RectLike => ({
  top,
  left,
  bottom: top + height,
  right: left + width,
  height,
  width,
});

const container = { top: 0, left: 0, right: 300, bottom: 400 };

describe('the lines of the rects', () => {
  it('clusters horizontal fragments into one box per visual line', () => {
    const rects = [
      rect(0, 10, 16, 50), // line 1, fragment A
      rect(0, 60, 16, 40), // line 1, fragment B (same vertical band)
      rect(20, 10, 16, 80), // line 2
    ];
    expect(lineBoxesOf(rects, false, false, container)).toEqual([
      { start: 0, end: 16 },
      { start: 20, end: 36 },
    ]);
  });

  it('ignores zero-size rects', () => {
    const rects = [rect(0, 10, 16, 50), rect(20, 0, 0, 0), rect(40, 10, 16, 50)];
    expect(lineBoxesOf(rects, false, false, container)).toEqual([
      { start: 0, end: 16 },
      { start: 40, end: 56 },
    ]);
  });

  it('returns sorted boxes even when rects are out of order', () => {
    const rects = [rect(40, 10, 16, 50), rect(0, 10, 16, 50), rect(20, 10, 16, 50)];
    expect(lineBoxesOf(rects, false, false, container).map((b) => b.start)).toEqual([0, 20, 40]);
  });

  it('maps vertical-rl columns as distance from the right edge', () => {
    // container.right = 300; a column at left=260,right=276 -> [300-276, 300-260] = [24, 40]
    const rects = [rect(0, 260, 200, 16)];
    expect(lineBoxesOf(rects, true, true, container)).toEqual([{ start: 24, end: 40 }]);
  });

  it('maps vertical-lr columns as distance from the left edge', () => {
    const rects = [rect(0, 24, 200, 16)];
    expect(lineBoxesOf(rects, true, false, container)).toEqual([{ start: 24, end: 40 }]);
  });

  it('drops multi-line block rects so paragraphs are not merged into one box', () => {
    // Range.getClientRects() includes the <p> border box (h=160) alongside its
    // 4 line boxes; the tall block rect must be discarded, not merged.
    const rects = [
      rect(0, 10, 16, 400),
      rect(20, 10, 16, 400),
      rect(40, 10, 16, 400),
      rect(60, 10, 16, 400),
      rect(0, 10, 160, 400), // the paragraph block box
    ];
    expect(lineBoxesOf(rects, false, false, container)).toEqual([
      { start: 0, end: 16 },
      { start: 20, end: 36 },
      { start: 40, end: 56 },
      { start: 60, end: 76 },
    ]);
  });
});

describe('the next lines', () => {
  // 10 lines, each 16px tall, 20px apart, starting at 0.
  const evenBoxes = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map((s) => ({
    start: s,
    end: s + 16,
  }));

  it('returns null when there are no line boxes', () => {
    expect(snapToLines(0, 36, 2, 'forward', [])).toBeNull();
  });

  it('returns the next block of N lines as { start, end }', () => {
    // current block covers lines[0..1] => [0,36]; next group is lines[2..3] => [40,76].
    expect(snapToLines(0, 36, 2, 'forward', evenBoxes)).toEqual({ start: 40, end: 76 });
  });

  it('returns the previous block of N lines when moving backward', () => {
    // current block covers lines[2..3] => [40,76]; previous group is lines[0..1] => [0,36].
    expect(snapToLines(40, 76, 2, 'backward', evenBoxes)).toEqual({
      start: 0,
      end: 36,
    });
  });

  it('returns the first group from the top with -Infinity', () => {
    expect(snapToLines(-Infinity, -Infinity, 2, 'forward', evenBoxes)).toEqual({
      start: 0,
      end: 36,
    });
  });

  it('returns the last group from the bottom with Infinity', () => {
    expect(snapToLines(Infinity, Infinity, 2, 'backward', evenBoxes)).toEqual({
      start: 160,
      end: 196,
    });
  });

  it('returns null at the bottom boundary so the page can flip', () => {
    const boxes = [
      { start: 0, end: 16 },
      { start: 20, end: 36 },
    ];
    expect(snapToLines(0, 36, 2, 'forward', boxes)).toBeNull();
  });

  it('returns null at the top boundary so the page can flip', () => {
    const boxes = [
      { start: 80, end: 96 },
      { start: 100, end: 116 },
    ];
    expect(snapToLines(80, 116, 2, 'backward', boxes)).toBeNull();
  });

  it('re-snapping forward from a block start stays on the same block (no skip)', () => {
    // Anchoring the re-snap at the band's leading edge must return the same block,
    // not advance one line. (Anchoring at the band CENTER, which sits inside a line,
    // would skip to the next line — the page-turn "first line skipped" bug.)
    const blockStart = 40; // lines[2..3] => [40,76]
    expect(snapToLines(blockStart, blockStart, 2, 'forward', evenBoxes)).toEqual({
      start: 40,
      end: 76,
    });
    // A center anchor (sitting inside lines[2]) advances to the next group — the bug.
    const center = 48; // inside lines[2] (40..56)
    expect(snapToLines(center, center, 2, 'forward', evenBoxes)).toEqual({
      start: 60,
      end: 96,
    });
  });
});

describe('the lines shown', () => {
  it('keeps lines at least half visible within the viewport and drops the rest', () => {
    const boxes = [
      { start: 0, end: 16 }, // fully visible
      { start: 190, end: 206 }, // 10/16 visible at the bottom edge -> kept
      { start: 196, end: 212 }, // 4/16 visible -> dropped
      { start: -8, end: 8 }, // 8/16 visible at the top edge -> kept
      { start: -12, end: 4 }, // 4/16 visible -> dropped
    ];
    expect(visibleLines(boxes, 200)).toEqual([
      { start: 0, end: 16 },
      { start: 190, end: 206 },
      { start: -8, end: 8 },
    ]);
  });

  it('returns all line boxes when the dimension is unknown', () => {
    const boxes = [{ start: 500, end: 516 }];
    expect(visibleLines(boxes, 0)).toEqual(boxes);
  });
});

describe('the columns', () => {
  // Two columns in a 1000px-wide overlay: col0 centers < 500, col1 centers >= 500.
  const colRect = (top: number, left: number): RectLike => rect(top, left, 16, 420);

  it('splits rects into columns by x and lines by y', () => {
    const rects = [colRect(0, 40), colRect(20, 40), colRect(0, 540), colRect(20, 540)];
    const cols = columnsOf(rects, 2, 1000, false);
    expect(cols).toEqual([
      {
        left: 40,
        right: 460,
        lines: [
          { start: 0, end: 16 },
          { start: 20, end: 36 },
        ],
      },
      {
        left: 540,
        right: 960,
        lines: [
          { start: 0, end: 16 },
          { start: 20, end: 36 },
        ],
      },
    ]);
  });

  it('orders columns right-to-left when rtl', () => {
    const rects = [colRect(0, 40), colRect(0, 540)];
    const cols = columnsOf(rects, 2, 1000, true);
    expect(cols.map((c) => c.left)).toEqual([540, 40]);
  });

  it('returns a single full-width column when columnCount is 1', () => {
    const rects = [colRect(0, 40), colRect(0, 540)];
    const cols = columnsOf(rects, 1, 1000, false);
    expect(cols).toHaveLength(1);
    expect(cols[0]!.lines).toHaveLength(1); // both rects share top 0 -> one line
  });

  it('drops multi-line block rects inside a column', () => {
    const rects = [
      colRect(0, 40),
      colRect(20, 40),
      colRect(40, 40),
      colRect(60, 40),
      rect(0, 40, 160, 420), // paragraph block box in column 0
    ];
    const cols = columnsOf(rects, 2, 1000, false);
    expect(cols).toHaveLength(1);
    expect(cols[0]!.lines).toEqual([
      { start: 0, end: 16 },
      { start: 20, end: 36 },
      { start: 40, end: 56 },
      { start: 60, end: 76 },
    ]);
  });
});

describe('the next lines in columns', () => {
  // col0: 5 lines (0..80); col1: 3 lines (0..40); each 16px tall, 20px apart.
  const columns = [
    {
      left: 40,
      right: 460,
      lines: [0, 20, 40, 60, 80].map((s) => ({ start: s, end: s + 16 })),
    },
    {
      left: 540,
      right: 960,
      lines: [0, 20, 40].map((s) => ({ start: s, end: s + 16 })),
    },
  ];

  it('advances within the active column', () => {
    // col0, current block lines[0..1] => [0,36]; next block lines[2..3] => [40,76].
    expect(snapColumns(0, 0, 36, 2, 'forward', columns)).toEqual({
      columnIndex: 0,
      start: 40,
      end: 76,
    });
  });

  it('jumps to the next column at the bottom of the current one', () => {
    // col0 current block lines[3..4] => [60,96]; nothing below -> col1 first block [0,36].
    expect(snapColumns(0, 60, 96, 2, 'forward', columns)).toEqual({
      columnIndex: 1,
      start: 0,
      end: 36,
    });
  });

  it('returns null past the last line of the last column', () => {
    // col1 current block covers its last lines [20,56]; no next group anywhere.
    expect(snapColumns(1, 20, 56, 2, 'forward', columns)).toBeNull();
  });

  it('jumps to the previous column when moving backward off the top', () => {
    // col1 current block [0,36]; nothing above in col1 -> col0 last block [60,96].
    expect(snapColumns(1, 0, 36, 2, 'backward', columns)).toEqual({
      columnIndex: 0,
      start: 60,
      end: 96,
    });
  });

  it('returns null when there are no columns', () => {
    expect(snapColumns(0, 0, 36, 2, 'forward', [])).toBeNull();
  });
});

// laid out again, the band on the same text, not on what is at its place now
describe('the lines of the text anchored', () => {
  const boxes = [
    { start: 100, end: 140 },
    { start: 200, end: 240 },
    { start: 300, end: 340 },
    { start: 400, end: 440 },
  ];

  it('returns the block of N lines starting at the line containing the anchor', () => {
    expect(snapToAnchor(220, 2, boxes)).toEqual({ start: 200, end: 340 });
  });

  it('clamps the block at the last line', () => {
    expect(snapToAnchor(420, 2, boxes)).toEqual({ start: 400, end: 440 });
  });

  it('snaps to the nearest line when the anchor sits just outside it', () => {
    // 10px above the 100..140 line: within half a line height (20) of it.
    expect(snapToAnchor(150, 1, boxes)).toEqual({ start: 100, end: 140 });
  });

  it('returns null when the anchor is far from any line', () => {
    // 170 is 30px away from both surrounding lines, beyond the 20px tolerance.
    expect(snapToAnchor(170, 1, boxes)).toBeNull();
    expect(snapToAnchor(600, 1, boxes)).toBeNull();
  });

  it('returns null when there are no lines', () => {
    expect(snapToAnchor(100, 1, [])).toBeNull();
  });
});

describe('the lines of the text anchored, in columns', () => {
  const columns = [
    {
      left: 40,
      right: 360,
      lines: [
        { start: 100, end: 140 },
        { start: 200, end: 240 },
      ],
    },
    {
      left: 440,
      right: 760,
      lines: [
        { start: 100, end: 140 },
        { start: 200, end: 240 },
      ],
    },
  ];

  it('snaps within the column that contains the anchor point', () => {
    expect(snapColumnsToAnchor(120, 500, 1, columns)).toEqual({
      columnIndex: 1,
      start: 100,
      end: 140,
    });
  });

  it('falls back to the nearest column when the anchor is in the gutter', () => {
    expect(snapColumnsToAnchor(220, 380, 1, columns)).toEqual({
      columnIndex: 0,
      start: 200,
      end: 240,
    });
  });

  it('returns null when there are no columns', () => {
    expect(snapColumnsToAnchor(120, 500, 1, [])).toBeNull();
  });

  it('returns null when the anchor misses every line in the column', () => {
    expect(snapColumnsToAnchor(600, 500, 1, columns)).toBeNull();
  });
});
