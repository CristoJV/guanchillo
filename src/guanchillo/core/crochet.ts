import { chartRow, hasStarted, rowMovesLeftToRight, tileAt, totalSteps, type Pattern, type Progress } from './model.js';
import { sphereLayout, stitchOperation, type SphereRound } from './sphere.js';

const operations = {
  'magic-ring': { symbol: 'X', label: 'Single crochet into the magic ring' },
  'increase-first': { symbol: 'V', label: 'Increase · first stitch into the same stitch' },
  'increase-second': { symbol: 'V', label: 'Increase · second stitch into the same stitch' },
  decrease: { symbol: 'Λ', label: 'Decrease · join the next two stitches' },
  single: { symbol: 'X', label: 'Single crochet' },
};

function operationAt(round: SphereRound | undefined, point: number) {
  return round ? stitchOperation(round, point) : 'single';
}

type Stitch = NonNullable<ReturnType<typeof tileAt>>;

function yarnGuidance(pattern: Pattern, progress: Progress, current: Stitch, round?: SphereRound) {
  const color = pattern.cells[current.index];
  const yarn = pattern.palette[color]?.name ?? 'Unassigned';
  const width = chartRow(pattern, current.y).stitches;
  const remaining = width - current.point + 1;
  const stride = current.leftToRight ? 1 : -1;
  const operation = operationAt(round, current.point);
  let run = 1;
  while (run < remaining && pattern.cells[current.index + run * stride] === color &&
    operationAt(round, current.point + run) === operation) run++;

  let followingColor: number | undefined;
  if (run < remaining) {
    followingColor = pattern.cells[current.index + run * stride];
  } else {
    const following = tileAt(pattern, progress, progress.offset + run);
    if (following) followingColor = pattern.cells[following.index];
  }
  const closesWithOtherYarn = followingColor !== undefined && followingColor !== color;
  const count = run - Number(closesWithOtherYarn);
  if (count === 0 && followingColor !== undefined) {
    const nextYarn = pattern.palette[followingColor]?.name ?? 'Unassigned';
    return { instruction: `Crochet this stitch in ${yarn} but close it with ${nextYarn}.`, changingColor: true };
  }
  const ending = count === remaining ? ` (to end the ${round ? 'round' : 'row'})` : '';
  return {
    instruction: `Crochet ${count} ${count === 1 ? 'stitch' : 'stitches'} in ${yarn}${ending}.`,
    changingColor: false,
  };
}

export function crochetStep(pattern: Pattern, progress: Progress) {
  const total = totalSteps(pattern, progress);
  const current = tileAt(pattern, progress, progress.offset);
  const color = current && pattern.palette[pattern.cells[current.index]];
  const sphere = pattern.shape === 'sphere';
  const round = sphere && current ? sphereLayout(pattern.rows).rounds[current.row - 1] : undefined;
  const operation = round && current ? operations[operationAt(round, current.point)].label : '';
  const roundNote = !sphere ? '' : !current ? 'Fasten off and close the opening.' :
    current.row === pattern.rows ? 'Stuff the sphere before finishing this round.' : '';
  const guidance = current ? yarnGuidance(pattern, progress, current, round) :
    { instruction: 'Pattern complete.', changingColor: false };
  return {
    total, current, color, sphere, operation, roundNote, ...guidance,
    started: hasStarted(progress), done: progress.offset,
    percent: Math.floor(progress.offset * 100 / total),
  };
}

export type CrochetStep = ReturnType<typeof crochetStep>;

const slots = 8;

export function stitchWindow(pattern: Pattern, progress: Progress, step: CrochetStep) {
  const tile = step.current ?? tileAt(pattern, progress, step.total - 1);
  const start = tileAt(pattern, progress, 0);
  if (!tile || !start) throw new Error('Missing stitch window.');
  const { row: activeRow, x: activeX, point: activePoint, leftToRight } = tile;
  const { row: startRow, point: startPoint } = start;
  const width = chartRow(pattern, tile.y).stitches;
  const length = Math.min(slots, width);
  const before = tile.leftToRight ? 2 : 5;
  const first = Math.max(0, Math.min(tile.x - before, width - length));
  const center = (first + length / 2) / width;
  const rounds = step.sphere ? sphereLayout(pattern.rows).rounds : undefined;

  function renderRow(number: number) {
    if (number < 1 || number > pattern.rows) return null;
    const y = pattern.rows - number;
    const row = chartRow(pattern, y);
    const active = number === activeRow;
    const leftToRight = rowMovesLeftToRight(progress, number);
    const count = Math.min(slots, row.stitches);
    const from = active ? first : Math.max(0, Math.min(Math.round(center * row.stitches - count / 2), row.stitches - count));
    const cells = Array.from({ length: count }, (_, index) => {
      const x = from + index;
      const point = leftToRight ? x + 1 : row.stitches - x;
      const outside = number < startRow || (number === startRow && point < startPoint);
      const done = number < activeRow || (active && (!step.current || point < activePoint));
      const state = outside ? 'outside' : done ? 'done' : active && x === activeX ? 'current' : 'next';
      return { state, point, color: pattern.palette[pattern.cells[row.start + x]],
        operation: operations[operationAt(rounds?.[number - 1], point)] };
    });
    return { number, cells };
  }

  return {
    row: activeRow, leftToRight, first, slots,
    rows: [renderRow(activeRow + 1), renderRow(activeRow), renderRow(activeRow - 1)],
  };
}
