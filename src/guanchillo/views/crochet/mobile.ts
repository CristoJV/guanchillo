import { stitchWindow, type CrochetStep } from '../../core/crochet.js';
import type { Pattern, Progress } from '../../core/model.js';
import { byId, format, setText } from '../shared/dom.js';

export function makeMobileCrochet(move: (amount: -1 | 1) => void) {
  const view = byId('mobile-crochet');
  const strip = byId('mobile-stitches');
  const warning = byId('mobile-color-warning');
  const details = byId('mobile-operation');
  const note = byId('mobile-round-note');
  const next = byId('mobile-next', 'button');
  const previous = byId('mobile-previous', 'button');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let last: { id: string; row: number; first: number; done: number } | undefined;
  let animation: Animation | undefined;

  next.addEventListener('click', () => move(1));
  previous.addEventListener('click', () => move(-1));

  function render(pattern: Pattern, progress: Progress, step: CrochetStep) {
    const { current, cue, color, nextColor, started, done, total } = step;
    const visible = stitchWindow(pattern, progress, step);
    const cells = visible.cells.map(({ state, point, color }) => {
      const cell = document.createElement('span');
      cell.className = 'mobile-stitch';
      cell.dataset.state = state;
      cell.setAttribute('role', 'listitem');
      cell.setAttribute('aria-label', `Stitch ${point}, ${color?.name ?? 'unassigned'}, ${state}`);
      cell.style.backgroundColor = color?.hex ?? '#fbf8ef';
      return cell;
    });
    animation?.cancel();
    strip.replaceChildren(...cells);
    const shift = visible.first - (last?.first ?? visible.first);
    if (shift && last?.id === pattern.id && last.row === visible.row && Math.abs(done - last.done) === 1 &&
      view.offsetWidth > 0 && !reduceMotion.matches) {
      animation = strip.animate([{ transform: `translateX(${Math.sign(shift) * 0.65}rem)` }, { transform: 'none' }],
        { duration: 140, easing: 'ease-out' });
    }
    last = { id: pattern.id, row: visible.row, first: visible.first, done };

    setText('mobile-pattern-name', pattern.name);
    setText('mobile-percent', step.percent + '%');
    setText('mobile-count', `${format(done)} / ${format(total)}`);
    const bar = byId('mobile-progress', 'progress');
    bar.max = total;
    bar.value = done;
    setText('mobile-position', `${step.sphere ? 'Round' : 'Row'} ${visible.row}${current ? ' · Stitch ' + current.point : ''}`);
    setText('mobile-direction', visible.leftToRight ? '→' : '←');
    byId('mobile-direction').setAttribute('aria-label', visible.leftToRight ? 'Left to right' : 'Right to left');

    const changing = cue?.fullStitches === 0 && nextColor !== undefined;
    const count = cue?.fullStitches ?? 0;
    const yarn = color?.name ?? 'Unassigned';
    setText('mobile-instruction', !current ? 'Pattern complete.' : changing ?
      `Crochet 1 stitch in ${yarn}.` : `Crochet ${format(count)} ${count === 1 ? 'stitch' : 'stitches'} in ${yarn}.`);
    warning.hidden = nextColor === undefined;
    warning.classList.toggle('is-color-change', changing);
    warning.textContent = nextColor === undefined ? '' : changing ?
      `Close this stitch with ${nextColor}.` : `Then close the next stitch with ${nextColor}.`;
    details.hidden = !step.operation;
    details.textContent = step.operation;
    note.hidden = !step.roundNote;
    note.textContent = step.roundNote;
    next.textContent = started ? 'Next' : 'Start';
    next.disabled = !current;
    previous.disabled = done === 0;
  }

  return { render, focus: () => view.focus({ preventScroll: true }) };
}
