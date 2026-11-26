import { actionFor, isMouseButton, keyBinding, type CrochetControls } from '../../core/crochet-controls.js';

const interactive = 'a, button, input, select, textarea, label, summary, [contenteditable], [role="button"], [role="link"], [role="textbox"]';

function accepts(target: EventTarget | null, kind: 'key' | 'pointer') {
  return target instanceof Element && !target.closest(interactive + ', header.site-header, dialog, [data-crochet-ignore]' +
    (kind === 'pointer' ? ', [data-crochet-pointer-ignore]' : ''));
}

interface CrochetInputOptions {
  isActive: () => boolean;
  controls: () => CrochetControls;
  move: (amount: -1 | 1) => void;
  surface: HTMLElement;
  jump: (event: MouseEvent) => void;
}

export function bindCrochetInput({ isActive, controls, move, surface, jump }: CrochetInputOptions) {
  const enabled = () => isActive() && !document.querySelector('dialog[open]');
  type PointerStart = { id: number; x: number; y: number; button: number; type: string; chart: boolean };
  let pointer: PointerStart | undefined;

  document.addEventListener('keydown', event => {
    if (!enabled() || event.defaultPrevented) return;
    const stepButton = event.target instanceof Element && event.target.closest('[data-crochet-step]');
    if (stepButton ? event.key === ' ' || event.key === 'Enter' : !accepts(event.target, 'key')) return;
    const input = keyBinding(event);
    const action = input && actionFor(controls(), input);
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) move(action === 'advance' ? 1 : -1);
  });

  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary) {
      pointer = undefined;
      return;
    }
    pointer = undefined;
    if (!enabled() || !isMouseButton(event.button) || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const chart = event.target === surface && event.button === 0;
    if (!chart && !accepts(event.target, 'pointer')) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, button: event.button, type: event.pointerType, chart };
    if (event.button === 1 && actionFor(controls(), { kind: 'mouse', button: 1 })) event.preventDefault();
  }, true);

  const tooFar = (event: MouseEvent, start: PointerStart) => Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8;
  document.addEventListener('pointermove', event => {
    if (pointer?.id === event.pointerId && tooFar(event, pointer)) pointer = undefined;
  }, true);
  document.addEventListener('pointercancel', event => {
    if (pointer?.id === event.pointerId) pointer = undefined;
  }, true);
  window.addEventListener('blur', () => { pointer = undefined; });

  function handleClick(event: MouseEvent) {
    const start = pointer;
    pointer = undefined;
    if (!start || !enabled() || event.defaultPrevented || start.button !== event.button || tooFar(event, start) ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (start.chart) {
      if (event.target === surface) jump(event);
      return;
    }
    if (!accepts(event.target, 'pointer') || !isMouseButton(event.button)) return;
    const action = start.type === 'touch' || start.type === 'pen' ? 'advance' :
      actionFor(controls(), { kind: 'mouse', button: event.button });
    if (!action) return;
    event.preventDefault();
    move(action === 'advance' ? 1 : -1);
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('auxclick', handleClick);
  document.addEventListener('contextmenu', event => {
    if (enabled() && event.button === 2 && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
      accepts(event.target, 'pointer') && actionFor(controls(), { kind: 'mouse', button: 2 })) event.preventDefault();
  });
}
