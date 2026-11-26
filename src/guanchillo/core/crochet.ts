import { chartRow, hasStarted, makeColorGuide, tileAt, totalSteps, type Pattern, type Progress } from './model.js';
import { sphereLayout, stitchOperation } from './sphere.js';

const operations = {
  'magic-ring': 'Single crochet into the magic ring',
  'increase-first': 'Increase · first stitch into the same stitch',
  'increase-second': 'Increase · second stitch into the same stitch',
  decrease: 'Decrease · join the next two stitches',
  single: 'Single crochet',
};

export function crochetStep(pattern: Pattern, progress: Progress, colorGuide: ReturnType<typeof makeColorGuide>) {
  const total = totalSteps(pattern, progress);
  const current = tileAt(pattern, progress, progress.offset);
  const color = current && pattern.palette[pattern.cells[current.index]];
  const cue = colorGuide(progress.offset);
  const sphere = pattern.shape === 'sphere';
  const operation = sphere && current ? operations[stitchOperation(sphereLayout(pattern.rows).rounds[current.row - 1], current.point)] : '';
  const roundNote = !sphere ? '' : !current ? 'Fasten off and close the opening.' :
    current.row === pattern.rows ? 'Stuff the sphere before finishing this round.' : '';
  return {
    total, current, color, cue, sphere, operation, roundNote,
    started: hasStarted(progress), done: progress.offset,
    percent: Math.floor(progress.offset * 100 / total),
    nextColor: cue?.nextColor === undefined ? undefined : pattern.palette[cue.nextColor]?.name ?? 'Unassigned',
  };
}

export type CrochetStep = ReturnType<typeof crochetStep>;

export function stitchWindow(pattern: Pattern, progress: Progress, step: CrochetStep) {
  const tile = step.current ?? tileAt(pattern, progress, step.total - 1);
  if (!tile) throw new Error('Missing stitch window.');
  const row = chartRow(pattern, tile.y);
  const length = Math.min(8, row.stitches);
  const before = tile.leftToRight ? 2 : 5;
  const first = Math.max(0, Math.min(tile.x - before, row.stitches - length));
  const start = tileAt(pattern, progress, 0);
  const cells = Array.from({ length }, (_, index) => {
    const x = first + index;
    const point = tile.leftToRight ? x + 1 : row.stitches - x;
    const outside = start?.y === tile.y && point < start.point;
    const state = outside ? 'outside' : !step.current || point < tile.point ? 'done' : x === tile.x ? 'current' : 'next';
    return { state, point, color: pattern.palette[pattern.cells[row.start + x]] };
  });
  return { row: tile.row, leftToRight: tile.leftToRight, first, cells };
}
