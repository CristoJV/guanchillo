import { stitchWindow, type CrochetStep } from '../../core/crochet.js';
import type { Pattern, Progress } from '../../core/model.js';
import { byId, format, setText } from '../shared/dom.js';

function stitchInk(hex: string) {
  const linear = [1, 3, 5].map(index => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.179 ? '#101612' : '#fffdf7';
}

export function makeMobileCrochet(move: (amount: -1 | 1) => void) {
  const view = byId('mobile-crochet');
  const chart = byId('mobile-stitch-window');
  const rows = ['mobile-stitches-next', 'mobile-stitches', 'mobile-stitches-previous'].map(id => byId(id));
  const message = byId('mobile-message');
  const instruction = byId('mobile-instruction');
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
    const { current, started, done, total } = step;
    const visible = stitchWindow(pattern, progress, step);
    const rowName = step.sphere ? 'Round' : 'Row';
    visible.rows.forEach((row, index) => {
      const strip = rows[index];
      strip.setAttribute('aria-hidden', String(row === null));
      if (row) strip.setAttribute('aria-label', `${rowName} ${row.number}`);
      const leading = Math.floor((visible.slots - (row?.cells.length ?? 0)) / 2);
      const cells = Array.from({ length: visible.slots }, (_, slot) => {
        const cell = document.createElement('span');
        cell.className = 'mobile-stitch-slot';
        const stitch = row?.cells[slot - leading];
        if (!stitch) {
          cell.setAttribute('aria-hidden', 'true');
          return cell;
        }
        const { state, point, color, operation } = stitch;
        const fill = color?.hex ?? '#fbf8ef';
        cell.classList.add('mobile-stitch');
        cell.dataset.state = state;
        cell.setAttribute('role', 'listitem');
        cell.setAttribute('aria-label', `Stitch ${point}, ${operation.label}, ${color?.name ?? 'unassigned'}, ${state}`);
        cell.textContent = operation.symbol;
        cell.style.backgroundColor = fill;
        cell.style.color = stitchInk(fill);
        return cell;
      });
      strip.replaceChildren(...cells);
    });

    animation?.cancel();
    const shift = visible.first - (last?.first ?? visible.first);
    if (shift && last?.id === pattern.id && last.row === visible.row && Math.abs(done - last.done) === 1 &&
      view.offsetWidth > 0 && !reduceMotion.matches) {
      animation = chart.animate([{ transform: `translateX(${Math.sign(shift) * 0.65}rem)` }, { transform: 'none' }],
        { duration: 140, easing: 'ease-out' });
    }
    last = { id: pattern.id, row: visible.row, first: visible.first, done };

    setText('mobile-pattern-name', pattern.name);
    setText('mobile-percent', step.percent + '%');
    setText('mobile-count', `${format(done)} / ${format(total)}`);
    const bar = byId('mobile-progress', 'progress');
    bar.max = total;
    bar.value = done;
    setText('mobile-position', `${rowName} ${visible.row}${current ? ' · Stitch ' + current.point : ''}`);
    setText('mobile-direction', visible.leftToRight ? '→' : '←');
    byId('mobile-direction').setAttribute('aria-label', visible.leftToRight ? 'Left to right' : 'Right to left');

    instruction.textContent = step.instruction;
    instruction.classList.toggle('is-color-change', step.changingColor);
    details.hidden = !step.operation;
    details.textContent = step.operation;
    note.hidden = !step.roundNote;
    note.textContent = step.roundNote;
    message.scrollTop = 0;
    next.textContent = started ? 'Next' : 'Start';
    next.disabled = !current;
    previous.disabled = done === 0;
  }

  return { render, focus: () => view.focus({ preventScroll: true }) };
}
