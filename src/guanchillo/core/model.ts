import { gores, isSphereSize, sphereLayout } from './sphere.js';

export const limits = Object.freeze({ dimension: 256, colors: 8, defaultColors: 4, name: 80, file: 1_000_000 });
const legacyColorLimit = 24;

export interface Dimensions {
  rows: number;
  cols: number;
}

export interface Color {
  name: string;
  hex: string;
}

export interface ColorProfile {
  palette: Color[];
  mapping: number[];
}

interface PatternSource {
  title: string;
  url: string;
  note?: string;
}

interface PatternData extends Dimensions {
  version: 1;
  shape: 'flat' | 'sphere';
  tags: string[];
  source?: PatternSource;
  recommended?: Dimensions;
  name: string;
  palette: Color[];
  colorProfiles?: ColorProfile[];
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
  started?: boolean;
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
];

function newPatternId(): string {
  return globalThis.crypto.randomUUID?.() ?? Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0'),
  ).join('');
}

export function newPattern(rows = 24, cols = 24, name = 'Untitled pattern'): Pattern {
  return {
    version: 1, shape: 'flat', tags: [],
    id: newPatternId(),
    name, rows, cols, palette: structuredClone(samplePalette),
    cells: Array<number>(rows * cols).fill(-1),
  };
}

export function newSphere(rows: number, name = 'Untitled sphere'): Pattern {
  const layout = sphereLayout(rows);
  return {
    version: 1, shape: 'sphere', tags: [], id: newPatternId(),
    name, rows, cols: layout.goreWidth * gores, palette: structuredClone(samplePalette),
    cells: Array<number>(layout.stitches).fill(-1),
  };
}

export function chartRow(pattern: PatternData, y: number): { stitches: number; start: number } {
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
      if (distance === 3 || distance === 2) color = 2;
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

function parseTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || ![...value].every((tag: unknown) => typeof tag === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag))) {
    throw new Error('Pattern tags must be a list of lowercase names separated by hyphens.');
  }
  return [...new Set<string>(value)];
}

function parseSource(value: unknown): PatternSource | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim() ||
    typeof value.url !== 'string' || (value.note !== undefined && typeof value.note !== 'string')) {
    throw new Error('Invalid pattern source.');
  }
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    throw new Error('Pattern sources must use a public HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Pattern sources must use a public HTTPS URL.');
  }
  return { title: value.title.trim(), url: url.href, ...(value.note ? { note: value.note } : {}) };
}

function parseRecommended(value: unknown, rows: number, cols: number, shape: PatternData['shape']): Dimensions | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isIntegerInRange(value.rows, 1, rows) || !isIntegerInRange(value.cols, 1, cols) ||
    (shape === 'sphere' && (!isSphereSize(value.rows) || value.cols !== value.rows * 2))) {
    throw new Error('Invalid recommended pattern size.');
  }
  return { rows: value.rows, cols: value.cols };
}

function parsePalette(palette: unknown, max: number): Color[] {
  if (!Array.isArray(palette) || !palette.length || palette.length > max) throw new Error('Invalid color palette.');
  return Array.from(palette, (entry: unknown) => {
    const colorName = isRecord(entry) && typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!colorName || colorName.length > limits.name || !isRecord(entry) ||
      typeof entry.hex !== 'string' || !/^#[a-f\d]{6}$/i.test(entry.hex)) {
      throw new Error('Each color needs a name and a six-digit hex code.');
    }
    return { name: colorName, hex: entry.hex.toLowerCase() };
  });
}

function parseColorProfiles(value: unknown, colorCount: number): ColorProfile[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length >= colorCount) throw new Error('Invalid color profiles.');
  const sizes = new Set<number>();
  return Array.from(value, (profile: unknown) => {
    if (!isRecord(profile) || !Array.isArray(profile.mapping) || profile.mapping.length !== colorCount) {
      throw new Error('Each color profile needs one mapping per base color.');
    }
    const palette = parsePalette(profile.palette, colorCount - 1);
    const mapping: unknown[] = [...profile.mapping];
    if (!mapping.every(index => isIntegerInRange(index, 0, palette.length - 1))) {
      throw new Error('Color profile mappings must refer to colors in their palette.');
    }
    if (sizes.has(palette.length)) throw new Error('Color profiles must have distinct palette sizes.');
    sizes.add(palette.length);
    return { palette, mapping };
  });
}

export function parsePattern(value: unknown): PatternData & { id: string | null } {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('Expected a version 1 Guanchillo pattern.');
  }
  const { version, rows, cols, palette } = value;
  const shape = value.shape === undefined ? 'flat' : value.shape;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!isIntegerInRange(rows, 1, limits.dimension) || !isIntegerInRange(cols, 1, limits.dimension)) {
    throw new Error('Rows and columns must be between 1 and 256.');
  }
  if (shape !== 'flat' && shape !== 'sphere') throw new Error('Unknown pattern shape.');
  if (shape === 'sphere' && (!isSphereSize(rows) || cols !== sphereLayout(rows).goreWidth * gores)) {
    throw new Error('The sphere dimensions do not match its round count.');
  }
  if (!name || name.length > limits.name) throw new Error('Check the pattern name.');
  const colors = parsePalette(palette, legacyColorLimit);
  const colorProfiles = parseColorProfiles(value.colorProfiles, colors.length);
  const stitchCount = shape === 'sphere' ? sphereLayout(rows).stitches : rows * cols;
  const cells: unknown[] = Array.isArray(value.cells) && value.cells.length === stitchCount ? [...value.cells] : [];
  if (cells.length !== stitchCount || !cells.every(index => isIntegerInRange(index, -1, colors.length - 1))) {
    throw new Error('The cells do not match the dimensions or palette.');
  }
  const id = typeof value.id === 'string' && /^[a-z\d-]{16,64}$/i.test(value.id) ? value.id : null;
  const tags = parseTags(value.tags);
  const source = parseSource(value.source);
  const recommended = parseRecommended(value.recommended, rows, cols, shape);
  return {
    version, id, name, rows, cols, shape, tags, palette: colors, cells,
    ...(source ? { source } : {}), ...(recommended ? { recommended } : {}),
    ...(colorProfiles?.length ? { colorProfiles } : {}),
  };
}

function withChartSize(pattern: Pattern, rows: number, cols: number): Pattern {
  const { recommended, ...data } = pattern;
  const fits = recommended && recommended.rows <= rows && recommended.cols <= cols;
  return { ...data, rows, cols, ...(fits ? { recommended } : {}) };
}

function sphereColorCoverage(pattern: Pattern, x: number, width: number, top: number, bottom: number) {
  const coverage = new Float64Array(pattern.palette.length + 1);
  for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
    const source = chartRow(pattern, y);
    const height = Math.min(bottom, y + 1) - Math.max(top, y);
    const left = x * source.stitches / width;
    const right = (x + 1) * source.stitches / width;
    for (let col = Math.floor(left); col < Math.ceil(right); col++) {
      const overlap = Math.min(right, col + 1) - Math.max(left, col);
      coverage[pattern.cells[source.start + col] + 1] += height * overlap / source.stitches;
    }
  }
  return coverage;
}

export function resamplePattern(pattern: Pattern, rows: number, cols: number): Pattern {
  const result: Pattern = {
    ...withChartSize(pattern, rows, pattern.shape === 'sphere' ? sphereLayout(rows).goreWidth * gores : cols),
    cells: [],
  };
  const reduceSphere = pattern.shape === 'sphere' && rows < pattern.rows;
  for (let y = 0; y < rows; y++) {
    const top = y * pattern.rows / rows;
    const bottom = (y + 1) * pattern.rows / rows;
    const source = chartRow(pattern, Math.floor((y + 0.5) * pattern.rows / rows));
    const { stitches } = chartRow(result, y);
    for (let x = 0; x < stitches; x++) {
      const column = Math.floor((x + 0.5) * source.stitches / stitches);
      let color = pattern.cells[source.start + column];
      if (reduceSphere) {
        const coverage = sphereColorCoverage(pattern, x, stitches, top, bottom);
        for (let index = 0; index < coverage.length; index++) {
          if (coverage[index] > coverage[color + 1] + 1e-10) color = index - 1;
        }
      }
      result.cells.push(color);
    }
  }
  return result;
}

export function scaledFlatSize(pattern: Dimensions, x: number, y: number): Dimensions {
  function scaled(length: number, factor: number) {
    if (!Number.isInteger(factor) || factor === 0) throw new Error('Choose a whole-number scale factor.');
    return factor > 0 ? length * factor : Math.max(1, Math.round(length / -factor));
  }
  const cols = scaled(pattern.cols, x);
  const rows = scaled(pattern.rows, y);
  if (rows > limits.dimension || cols > limits.dimension) throw new Error('The scaled grid exceeds 256 stitches per axis.');
  return { rows, cols };
}

export function scaleFlatPattern(pattern: Pattern, x: number, y: number): Pattern {
  if (pattern.shape !== 'flat') throw new Error('Design scaling requires a flat grid.');
  const { rows, cols } = scaledFlatSize(pattern, x, y);
  return resamplePattern(pattern, rows, cols);
}

export function copyPattern(pattern: Pattern, name: string): Pattern {
  return { ...structuredClone(pattern), id: newPatternId(), name };
}

export function resizePattern(pattern: Pattern, rows: number, cols: number): Pattern {
  if (pattern.shape === 'sphere') return resamplePattern(pattern, rows, cols);
  const cells = Array<number>(rows * cols).fill(-1);
  for (let row = 1; row <= Math.min(rows, pattern.rows); row++) {
    for (let col = 0; col < Math.min(cols, pattern.cols); col++) {
      cells[(rows - row) * cols + col] = pattern.cells[(pattern.rows - row) * pattern.cols + col];
    }
  }
  return { ...withChartSize(pattern, rows, cols), cells };
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

export function newProgress(pattern: PatternData, start: Partial<Start> = {}): Progress {
  const direction = start.direction === 'ltr' ? 'ltr' : 'rtl';
  const row = start.row ?? 1;
  return {
    version: 1, rows: pattern.rows, cols: pattern.cols,
    row, col: start.col ?? (direction === 'ltr' ? 1 : chartRow(pattern, pattern.rows - row).stitches),
    direction, alternate: pattern.shape !== 'sphere' && (start.alternate ?? true), offset: 0,
  };
}

function pathStart(pattern: PatternData, progress: Progress): number {
  const { row, col, direction } = progress;
  const { stitches, start } = chartRow(pattern, pattern.rows - row);
  return pattern.cells.length - start - stitches + (direction === 'ltr' ? col - 1 : stitches - col);
}

export function totalSteps(pattern: PatternData, progress: Progress): number {
  return pattern.cells.length - pathStart(pattern, progress);
}

function rowMovesLeftToRight(progress: Progress, row: number): boolean {
  const reverse = progress.alternate && (row - progress.row) % 2 !== 0;
  return (progress.direction === 'ltr') !== reverse;
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
  const leftToRight = rowMovesLeftToRight(progress, row);
  const col = leftToRight ? point : stitches - point + 1;
  return { row, point, col, x: col - 1, y, index: start + col - 1, leftToRight };
}

export function hasStarted(progress: Progress): boolean {
  return progress.started === true || progress.offset > 0;
}

export function jumpToStitch(pattern: Pattern, progress: Progress, tile: GridPosition): Progress {
  const row = pattern.rows - tile.y;
  const { stitches, start } = chartRow(pattern, tile.y);
  const leftToRight = rowMovesLeftToRight(progress, row);
  const point = leftToRight ? tile.x : stitches - tile.x - 1;
  const offset = pattern.cells.length - start - stitches + point - pathStart(pattern, progress);
  if (offset === progress.offset) return progress;
  if (offset >= 0) return { ...progress, offset, started: true };
  const direction = leftToRight ? 'ltr' : 'rtl';
  return { ...newProgress(pattern, { row, col: tile.x + 1, direction, alternate: progress.alternate }), started: true };
}

export function parseProgress(pattern: PatternData, value: unknown): Progress | null {
  if (!isRecord(value) || value.version !== 1 || value.rows !== pattern.rows || value.cols !== pattern.cols) {
    return null;
  }
  const { row, col, direction, alternate, offset, started } = value;
  if (!isIntegerInRange(row, 1, pattern.rows) ||
    !isIntegerInRange(col, 1, chartRow(pattern, pattern.rows - row).stitches) ||
    (direction !== 'ltr' && direction !== 'rtl') || typeof alternate !== 'boolean' ||
    (started !== undefined && typeof started !== 'boolean') ||
    (pattern.shape === 'sphere' && alternate)) return null;
  const start = newProgress(pattern, { row, col, direction, alternate });
  if (!isIntegerInRange(offset, 0, totalSteps(pattern, start))) return null;
  return { ...start, offset, ...(started === undefined ? {} : { started }) };
}

function parsePatternFile(value: unknown): PatternFile {
  const { id, ...data } = parsePattern(value);
  const file: PatternFile = { ...data, ...(id === null ? {} : { id }) };
  if (isRecord(value) && value.progress !== undefined) {
    const progress = parseProgress(data, value.progress);
    if (!progress) throw new Error('The saved progress does not match the pattern or its stitch path.');
    file.progress = progress;
  }
  return file;
}

function checkFileSize(json: string): void {
  if (new TextEncoder().encode(json).length > limits.file) throw new Error('The file exceeds 1 MB.');
}

export function serializePattern(pattern: Pattern, progress?: Progress): string {
  const file = parsePatternFile({ ...pattern, progress });
  if (file.id === undefined) throw new Error('Invalid pattern ID.');
  file.recommended ??= { rows: file.rows, cols: file.cols };
  const json = JSON.stringify(file);
  checkFileSize(json);
  return json;
}

export function deserializePattern(json: string): { pattern: Pattern; progress: Progress } {
  checkFileSize(json);
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('The file does not contain valid JSON.');
  }
  const { progress, ...data } = parsePatternFile(value);
  const pattern: Pattern = { ...data, id: newPatternId() };
  return { pattern, progress: progress ?? newProgress(pattern) };
}

export function makeColorGuide(pattern: Pattern, progress: Progress) {
  const runs: { color: number; end: number }[] = [];
  const total = totalSteps(pattern, progress);
  for (let offset = 0; offset < total; offset++) {
    const tile = tileAt(pattern, progress, offset);
    if (!tile) break;
    const color = pattern.cells[tile.index];
    const run = runs.at(-1);
    if (run?.color === color) run.end = offset + 1;
    else runs.push({ color, end: offset + 1 });
  }

  return (offset: number) => {
    if (offset < 0 || offset >= total) return null;
    let first = 0;
    let last = runs.length - 1;
    while (first < last) {
      const middle = Math.floor((first + last) / 2);
      if (offset < runs[middle].end) last = middle;
      else first = middle + 1;
    }
    const nextColor = runs[first + 1]?.color;
    return { fullStitches: runs[first].end - offset - (nextColor === undefined ? 0 : 1), nextColor };
  };
}
