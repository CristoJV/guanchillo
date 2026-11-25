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
    throw new Error('Expected a version 1 Ganchillo pattern.');
  }
  const { version, rows, cols, cells, palette } = value;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!isIntegerInRange(rows, 1, limits.dimension) || !isIntegerInRange(cols, 1, limits.dimension)) {
    throw new Error('Rows and columns must be between 1 and 256.');
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
  if (!Array.isArray(cells) || cells.length !== rows * cols ||
    !cells.every((index: unknown): index is number => isIntegerInRange(index, -1, colors.length - 1))) {
    throw new Error('The cells do not match the dimensions or palette.');
  }
  const id = typeof value.id === 'string' && /^[a-z\d-]{16,64}$/i.test(value.id) ? value.id : null;
  return { version, id, name, rows, cols, palette: colors, cells: [...cells] };
}

export function resizePattern(pattern: Pattern, rows: number, cols: number): Pattern {
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

export function newProgress(pattern: Dimensions, start: Partial<Start> = {}): Progress {
  const direction = start.direction === 'ltr' ? 'ltr' : 'rtl';
  return {
    version: 1, rows: pattern.rows, cols: pattern.cols,
    row: start.row ?? 1, col: start.col ?? (direction === 'ltr' ? 1 : pattern.cols),
    direction, alternate: start.alternate ?? true, offset: 0,
  };
}

function pathStart(progress: Dimensions & Start): number {
  const { row, col, direction, cols } = progress;
  return (row - 1) * cols + (direction === 'ltr' ? col - 1 : cols - col);
}

export function totalSteps(progress: Dimensions & Start): number {
  return progress.rows * progress.cols - pathStart(progress);
}

export function tileAt(progress: Progress, offset: number): Tile | null {
  const position = pathStart(progress) + offset;
  if (offset < 0 || position >= progress.rows * progress.cols) return null;
  const row = Math.floor(position / progress.cols) + 1;
  const point = position % progress.cols + 1;
  const reverse = progress.alternate && (row - progress.row) % 2 === 1;
  const leftToRight = (progress.direction === 'ltr') !== reverse;
  const col = leftToRight ? point : progress.cols - point + 1;
  const y = progress.rows - row;
  return { row, point, col, x: col - 1, y, index: y * progress.cols + col - 1, leftToRight };
}

export function parseProgress(pattern: Dimensions, value: unknown): Progress | null {
  if (!isRecord(value) || value.version !== 1 || value.rows !== pattern.rows || value.cols !== pattern.cols) {
    return null;
  }
  const { row, col, direction, alternate, offset } = value;
  if (!isIntegerInRange(row, 1, pattern.rows) || !isIntegerInRange(col, 1, pattern.cols) ||
    (direction !== 'ltr' && direction !== 'rtl') || typeof alternate !== 'boolean') return null;
  const start = newProgress(pattern, { row, col, direction, alternate });
  if (!isIntegerInRange(offset, 0, totalSteps(start))) return null;
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
  const current = tileAt(progress, progress.offset);
  if (!current) return 0;
  const color = pattern.cells[current.index];
  let count = 1;
  for (let point = current.point + 1; point <= pattern.cols; point++) {
    const index = current.index + (current.leftToRight ? count : -count);
    if (pattern.cells[index] !== color) break;
    count++;
  }
  return count;
}
