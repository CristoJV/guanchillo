import { gores, isSphereSize, sphereLayout } from './sphere.js';

export const limits = Object.freeze({ dimension: 256, colors: 24, name: 80, file: 1_000_000 });

interface Dimensions {
  rows: number;
  cols: number;
}

interface Color {
  name: string;
  hex: string;
}

interface PatternData extends Dimensions {
  version: 1;
  shape?: 'sphere';
  name: string;
  palette: Color[];
  cells: number[];
}

export interface Pattern extends PatternData {
  id: string;
}

interface Start {
  row: number;
  col: number;
  direction: 'ltr' | 'rtl';
  alternate: boolean;
}

export interface Progress extends Dimensions, Start {
  version: 1;
  offset: number;
}

export interface PatternFile extends PatternData {
  id?: string;
  progress?: Progress;
}

export interface GridPosition {
  x: number;
  y: number;
}

interface Tile extends GridPosition {
  row: number;
  point: number;
  col: number;
  index: number;
  leftToRight: boolean;
}

const samplePalette: Color[] = [
  { name: 'Natural cream', hex: '#f4ead4' },
  { name: 'Pine green', hex: '#27574e' },
  { name: 'Sea glass', hex: '#739a8c' },
  { name: 'Terracotta', hex: '#bd6b50' },
  { name: 'Island gold', hex: '#e4b951' },
];

function newPatternId(): string {
  return globalThis.crypto.randomUUID?.() ?? Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0'),
  ).join('');
}

export function newPattern(rows = 24, cols = 24, name = 'Untitled pattern'): Pattern {
  return {
    version: 1,
    id: newPatternId(),
    name, rows, cols, palette: structuredClone(samplePalette),
    cells: Array<number>(rows * cols).fill(-1),
  };
}

export function newSphere(rows: number, name = 'Untitled sphere'): Pattern {
  const layout = sphereLayout(rows);
  return {
    version: 1, shape: 'sphere', id: newPatternId(),
    name, rows, cols: layout.goreWidth * gores, palette: structuredClone(samplePalette),
    cells: Array<number>(layout.stitches).fill(-1),
  };
}

export function chartRow(pattern: Pattern, y: number): { stitches: number; start: number } {
  if (pattern.shape !== 'sphere') return { stitches: pattern.cols, start: y * pattern.cols };
  const layout = sphereLayout(pattern.rows);
  const round = layout.rounds[pattern.rows - y - 1];
  return { stitches: round.stitches, start: layout.stitches - round.offset - round.stitches };
}

export function examplePattern(): Pattern {
  const pattern = newPattern(24, 24, 'Lava Diamond');
  for (let row = 0; row < pattern.rows; row++) {
    for (let col = 0; col < pattern.cols; col++) {
      const x = Math.min(col, 23 - col);
      const y = Math.min(row, 23 - row);
      const distance = 22 - x - y;
      let color = 0;

      if (distance === 11 || distance === 10) color = 1;
      if (distance === 9 || distance === 7) color = 2;
      if (distance === 8) color = 1;
      if (distance === 6) color = 0;
      if (distance === 5 || distance === 4) color = 3;
      if (distance === 3 || distance === 2) color = 4;
      if (distance === 1) color = 0;
      if (distance === 0) color = 1;
      if ((x < 3 && y === 2 - x) || (x === 3 && y === 3)) color = 2;
      if (x === 0 && y === 0) color = 1;

      pattern.cells[row * pattern.cols + col] = color;
    }
  }
  return pattern;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function parsePattern(value: unknown): PatternData & { id: string | null } {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('Expected a version 1 Guanchillo pattern.');
  }
  const { version, rows, cols, cells, palette, shape } = value;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!isIntegerInRange(rows, 1, limits.dimension) || !isIntegerInRange(cols, 1, limits.dimension)) {
    throw new Error('Rows and columns must be between 1 and 256.');
  }
  if (shape !== undefined && shape !== 'sphere') throw new Error('Unknown pattern shape.');
  if (shape === 'sphere' && (!isSphereSize(rows) || cols !== sphereLayout(rows).goreWidth * gores)) {
    throw new Error('The sphere dimensions do not match its round count.');
  }
  if (!name || name.length > limits.name || !Array.isArray(palette) || !palette.length || palette.length > limits.colors) {
    throw new Error('Check the pattern name and color palette.');
  }
  const colors = palette.map((entry: unknown) => {
    const colorName = isRecord(entry) && typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!colorName || colorName.length > limits.name || !isRecord(entry) ||
      typeof entry.hex !== 'string' || !/^#[a-f\d]{6}$/i.test(entry.hex)) {
      throw new Error('Each color needs a name and a six-digit hex code.');
    }
    return { name: colorName, hex: entry.hex.toLowerCase() };
  });
  const stitchCount = shape === 'sphere' ? sphereLayout(rows).stitches : rows * cols;
  if (!Array.isArray(cells) || cells.length !== stitchCount ||
    !cells.every((index: unknown): index is number => isIntegerInRange(index, -1, colors.length - 1))) {
    throw new Error('The cells do not match the dimensions or palette.');
  }
  const id = typeof value.id === 'string' && /^[a-z\d-]{16,64}$/i.test(value.id) ? value.id : null;
  return { version, id, name, rows, cols, palette: colors, cells: [...cells], ...(shape ? { shape } : {}) };
}

export function resizePattern(pattern: Pattern, rows: number, cols: number): Pattern {
  if (pattern.shape === 'sphere') {
    const layout = sphereLayout(rows);
    const cells: number[] = [];
    for (const round of [...layout.rounds].reverse()) {
      const sourceY = Math.floor((rows - round.number + 0.5) * pattern.rows / rows);
      const source = chartRow(pattern, sourceY);
      for (let stitch = 0; stitch < round.stitches; stitch++) {
        cells.push(pattern.cells[source.start + Math.floor((stitch + 0.5) * source.stitches / round.stitches)]);
      }
    }
    return { ...pattern, rows, cols: layout.goreWidth * gores, cells };
  }
  const cells = Array<number>(rows * cols).fill(-1);
  for (let row = 1; row <= Math.min(rows, pattern.rows); row++) {
    for (let col = 0; col < Math.min(cols, pattern.cols); col++) {
      cells[(rows - row) * cols + col] = pattern.cells[(pattern.rows - row) * pattern.cols + col];
    }
  }
  return { ...pattern, rows, cols, cells };
}

export function counts(pattern: Pattern) {
  const colors = Array<number>(pattern.palette.length).fill(0);
  let empty = 0;
  for (const index of pattern.cells) {
    if (index === -1) empty++;
    else colors[index]++;
  }
  return { colors, empty };
}

export function newProgress(pattern: Pattern, start: Partial<Start> = {}): Progress {
  const direction = start.direction === 'ltr' ? 'ltr' : 'rtl';
  const row = start.row ?? 1;
  return {
    version: 1, rows: pattern.rows, cols: pattern.cols,
    row, col: start.col ?? (direction === 'ltr' ? 1 : chartRow(pattern, pattern.rows - row).stitches),
    direction, alternate: pattern.shape !== 'sphere' && (start.alternate ?? true), offset: 0,
  };
}

function pathStart(pattern: Pattern, progress: Progress): number {
  const { row, col, direction } = progress;
  const { stitches, start } = chartRow(pattern, pattern.rows - row);
  return pattern.cells.length - start - stitches + (direction === 'ltr' ? col - 1 : stitches - col);
}

export function totalSteps(pattern: Pattern, progress: Progress): number {
  return pattern.cells.length - pathStart(pattern, progress);
}

export function tileAt(pattern: Pattern, progress: Progress, offset: number): Tile | null {
  const position = pathStart(pattern, progress) + offset;
  if (offset < 0 || position >= pattern.cells.length) return null;
  let row: number, point: number;
  if (pattern.shape === 'sphere') {
    const rounds = sphereLayout(pattern.rows).rounds;
    // Find the last round whose first stitch is at or before this position.
    let first = 0;
    let last = rounds.length;
    while (last - first > 1) {
      const middle = Math.floor((first + last) / 2);
      if (rounds[middle].offset <= position) first = middle;
      else last = middle;
    }
    row = rounds[first].number;
    point = position - rounds[first].offset + 1;
  } else {
    row = Math.floor(position / progress.cols) + 1;
    point = position % progress.cols + 1;
  }
  const y = progress.rows - row;
  const { stitches, start } = chartRow(pattern, y);
  const reverse = progress.alternate && (row - progress.row) % 2 === 1;
  const leftToRight = (progress.direction === 'ltr') !== reverse;
  const col = leftToRight ? point : stitches - point + 1;
  return { row, point, col, x: col - 1, y, index: start + col - 1, leftToRight };
}

export function parseProgress(pattern: Pattern, value: unknown): Progress | null {
  if (!isRecord(value) || value.version !== 1 || value.rows !== pattern.rows || value.cols !== pattern.cols) {
    return null;
  }
  const { row, col, direction, alternate, offset } = value;
  if (!isIntegerInRange(row, 1, pattern.rows) ||
    !isIntegerInRange(col, 1, chartRow(pattern, pattern.rows - row).stitches) ||
    (direction !== 'ltr' && direction !== 'rtl') || typeof alternate !== 'boolean' ||
    (pattern.shape === 'sphere' && alternate)) return null;
  const start = newProgress(pattern, { row, col, direction, alternate });
  if (!isIntegerInRange(offset, 0, totalSteps(pattern, start))) return null;
  return { ...start, offset };
}

export function serializePattern(pattern: Pattern, progress?: Progress): string {
  const file: PatternFile = { ...pattern, progress };
  return JSON.stringify(file);
}

export function deserializePattern(json: string): { pattern: Pattern; progress: Progress } {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('The file does not contain valid JSON.');
  }
  const pattern: Pattern = { ...parsePattern(value), id: newPatternId() };
  if (isRecord(value) && 'progress' in value) {
    const progress = parseProgress(pattern, value.progress);
    if (!progress) throw new Error('The saved progress does not match the pattern or its stitch path.');
    return { pattern, progress };
  }
  return { pattern, progress: newProgress(pattern) };
}

export function colorRun(pattern: Pattern, progress: Progress): number {
  const current = tileAt(pattern, progress, progress.offset);
  if (!current) return 0;
  const color = pattern.cells[current.index];
  let count = 1;
  const { stitches } = chartRow(pattern, current.y);
  for (let point = current.point + 1; point <= stitches; point++) {
    const index = current.index + (current.leftToRight ? count : -count);
    if (pattern.cells[index] !== color) break;
    count++;
  }
  return count;
}
