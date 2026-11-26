import type { CrochetStep } from '../../core/crochet.js';
import type { Progress } from '../../core/model.js';
import { byId, format, setText } from '../shared/dom.js';
import type { makeGrid } from '../shared/grid.js';

export function makeDesktopCrochet(grid: ReturnType<typeof makeGrid>, surface: HTMLElement,
  move: (amount: -1 | 1) => void) {
  const nextStitch = byId('next-stitch', 'button');
  const cursorText = byId('grid-cursor');
  nextStitch.addEventListener('click', () => move(1));
  byId('previous-stitch', 'button').addEventListener('click', () => move(-1));

  function render(step: CrochetStep) {
    const { current, color: entry, started, done, total, sphere, instruction, changingColor, roundNote } = step;
    const guidance = byId('current-run');
    guidance.textContent = instruction;
    guidance.hidden = !current;
    guidance.classList.toggle('is-color-change', changingColor);
    cursorText.classList.toggle('is-color-change', changingColor);
    setText('percent', step.percent + '%');
    setText('done-count', format(done) + ' of ' + format(total) + (total === 1 ? ' stitch' : ' stitches'));
    byId('progress-bar', 'progress').value = done / total * 100;
    setText('current-heading', current ? 'Current stitch' : 'Pattern complete');
    setText('current-row-name', sphere ? 'Round' : 'Row');
    setText('current-row', current?.row ?? '—');
    setText('current-point', current?.point ?? '—');
    setText('current-color', current ? entry?.name ?? 'Unassigned' : 'All stitches complete');
    setText('current-direction', current ? current.leftToRight ? 'Left to right' : 'Right to left' : '');
    const operation = byId('current-operation');
    operation.hidden = !step.operation;
    operation.textContent = step.operation;
    byId('round-note').hidden = !roundNote;
    setText('round-note', roundNote);
    const swatch = byId('current-swatch');
    swatch.hidden = !current;
    swatch.style.backgroundColor = entry?.hex ?? '#fbf8ef';
    nextStitch.textContent = started ? 'Next stitch' : 'Start';
    nextStitch.disabled = !current;
    byId('previous-stitch', 'button').disabled = done === 0;
    cursorText.textContent = current ?
      (sphere ? 'Round ' : 'Row ') + current.row + ' · Stitch ' + current.point + ' · ' +
        instruction +
        (operation.hidden ? '' : ' · ' + operation.textContent) :
      'Pattern complete';
    grid.mark(current, true);
    grid.reveal();
  }

  return {
    render,
    focus: () => surface.focus({ preventScroll: true }),
    setup: (progress: Progress) => grid.setupProgress(progress),
    move: (progress: Progress, next: number) => grid.updateStep(progress, Math.min(next, progress.offset), next > progress.offset),
  };
}
