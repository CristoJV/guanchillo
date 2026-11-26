export const gores = 6;
export const sphereSizes = { min: 6, max: 126, step: 3, example: 21 };

export interface SphereRound {
  number: number;
  stitches: number;
  perGore: number;
  offset: number;
  kind: 'plain' | 'increase' | 'decrease';
  leading: number;
}

interface SphereLayout {
  rounds: readonly SphereRound[];
  stitches: number;
  goreWidth: number;
}

const layouts = new Map<number, SphereLayout>();

export function isSphereSize(rounds: number): boolean {
  return Number.isInteger(rounds) && rounds >= sphereSizes.min && rounds <= sphereSizes.max &&
    rounds % sphereSizes.step === 0;
}

export function sphereLayout(total: number): SphereLayout {
  const cached = layouts.get(total);
  if (cached) return cached;
  if (!isSphereSize(total)) throw new RangeError('Choose 6 to 126 rounds in multiples of 3.');

  const goreWidth = total / 3;
  const rounds: SphereRound[] = [];
  let stitches = 0;
  for (let number = 1; number <= total; number++) {
    const perGore = Math.min(number, goreWidth, total - number + 1);
    const kind = number > 1 && number <= goreWidth ? 'increase' :
      number > total - goreWidth + 1 ? 'decrease' : 'plain';
    const shapingWidth = kind === 'decrease' ? perGore + 1 : perGore;
    const singles = shapingWidth - 2;
    // On even shaping rounds, divide the single stitches across both ends of the repeat.
    const leading = kind === 'plain' ? 0 : shapingWidth % 2 === 0 ? singles / 2 : singles;
    const width = perGore * gores;
    rounds.push({ number, stitches: width, perGore, offset: stitches, kind, leading });
    stitches += width;
  }
  const layout = { rounds, stitches, goreWidth };
  layouts.set(total, layout);
  return layout;
}

export function projectedX(goreWidth: number, round: SphereRound, stitch: number): number {
  const gore = Math.floor(stitch / round.perGore);
  const inset = (goreWidth - round.perGore) / 2;
  return gore * goreWidth + inset + stitch % round.perGore;
}

export function projectedStitch(goreWidth: number, round: SphereRound, x: number, nearest = false): number | null {
  const gore = Math.min(gores - 1, Math.max(0, Math.floor(x / goreWidth)));
  const within = Math.floor(x - gore * goreWidth - (goreWidth - round.perGore) / 2);
  if (!nearest && (within < 0 || within >= round.perGore)) return null;
  return gore * round.perGore + Math.min(round.perGore - 1, Math.max(0, within));
}

export function specialStitches(round: SphereRound, leftToRight: boolean): number[] {
  if (round.kind === 'plain') return [];
  const width = round.kind === 'increase' ? 2 : 1;
  const first = leftToRight ? round.leading : round.perGore - round.leading - width;
  return Array.from({ length: gores }, (_, gore) => gore * round.perGore + first);
}

export function stitchOperation(round: SphereRound, point: number) {
  const previous = (point - 1) % round.perGore - round.leading;
  if (round.number === 1) return 'magic-ring';
  if (round.kind === 'increase' && previous === 0) return 'increase-first';
  if (round.kind === 'increase' && previous === 1) return 'increase-second';
  if (round.kind === 'decrease' && previous === 0) return 'decrease';
  return 'single';
}
