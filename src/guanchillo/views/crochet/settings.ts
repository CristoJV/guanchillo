import { actionFor, bindingLabel, isMouseButton, keyBinding, sameBinding, type Binding, type CrochetAction, type CrochetControls }
  from '../../core/crochet-controls.js';
import { chartRow, hasStarted, newProgress, seekStitch, tileAt, totalSteps, type Pattern, type Progress } from '../../core/model.js';
import { byId, setText } from '../shared/dom.js';

const actions = ['advance', 'back'] as const;
const defaults = [
  { kind: 'key', code: 'Space', label: 'Space' },
  { kind: 'key', code: 'Enter', label: 'Enter' },
  { kind: 'key', code: 'ArrowRight', label: '→' },
  { kind: 'mouse', button: 0 },
  { kind: 'key', code: 'ArrowLeft', label: '←' },
] satisfies Binding[];

interface SettingsOptions {
  getPattern: () => Pattern;
  getProgress: () => Progress;
  applyStart: (progress: Progress) => void;
  applyStitch: (progress: Progress) => void;
  getKeepAwake: () => boolean;
  setKeepAwake: (enabled: boolean) => void;
  getControls: () => CrochetControls;
  saveControls: (controls: CrochetControls) => void;
  focus: () => void;
}

export function bindCrochetSettings({ getPattern, getProgress, applyStart, applyStitch, getKeepAwake, setKeepAwake, getControls, saveControls, focus }: SettingsOptions) {
  const dialog = byId('progress-dialog', 'dialog');
  const startRow = byId('start-row', 'input');
  const startCol = byId('start-col', 'input');
  const direction = byId('start-direction', 'select');
  const alternate = byId('start-alternate', 'input');
  const capture = byId('capture-dialog', 'dialog');
  const keepAwake = byId('keep-screen-awake', 'input');
  const seekRow = byId('seek-row', 'input');
  const seekPoint = byId('seek-point', 'input');
  let selected: CrochetAction = 'advance';

  function updateStartLimit() {
    const pattern = getPattern();
    const row = startRow.valueAsNumber;
    if (!Number.isInteger(row) || row < 1 || row > pattern.rows) return;
    const { stitches } = chartRow(pattern, pattern.rows - row);
    startCol.max = String(stitches);
    if (startCol.valueAsNumber > stitches) startCol.valueAsNumber = stitches;
  }

  function updateSeekLimits() {
    const pattern = getPattern();
    const progress = getProgress();
    const row = seekRow.valueAsNumber;
    setText('seek-error', '');
    if (!seekRow.validity.valid) return;
    const { stitches } = chartRow(pattern, pattern.rows - row);
    const min = row === progress.row ? tileAt(pattern, progress, 0)!.point : 1;
    seekPoint.min = String(min);
    seekPoint.max = String(stitches);
    seekPoint.valueAsNumber = Math.min(stitches, Math.max(min, seekPoint.valueAsNumber || min));
  }

  function populateSeek(pattern: Pattern, progress: Progress) {
    byId('seek-section', 'details').open = false;
    setText('seek-row-label', pattern.shape === 'sphere' ? 'Round' : 'Row');
    const tile = tileAt(pattern, progress, Math.min(progress.offset, totalSteps(pattern, progress) - 1))!;
    seekRow.min = String(progress.row);
    seekRow.max = String(pattern.rows);
    seekRow.valueAsNumber = tile.row;
    seekPoint.valueAsNumber = tile.point;
    updateSeekLimits();
  }

  function renderControls() {
    const controls = getControls();
    for (const action of actions) {
      const binding = controls[action];
      const available = defaults.filter(input => actionFor(controls, input) === action).map(bindingLabel);
      setText('binding-' + action, binding ? bindingLabel(binding) : available.join(', ') || 'On-screen button');
      byId('clear-' + action, 'button').hidden = !binding;
    }
  }

  function open() {
    const pattern = getPattern();
    const progress = getProgress();
    const sphere = pattern.shape === 'sphere';
    setText('start-row-name', sphere ? 'Starting round' : 'Starting row');
    setText('start-col-name', sphere ? 'Stitch from left' : 'Starting column');
    setText('progress-origin-help', sphere ? 'Count rounds from the bottom and stitches from the left. Work in a continuous spiral.' :
      'Count rows from the bottom and columns from the left.');
    byId('start-alternate-field').hidden = sphere;
    startRow.max = String(pattern.rows);
    startRow.valueAsNumber = progress.row;
    startCol.valueAsNumber = progress.col;
    updateStartLimit();
    direction.value = progress.direction;
    alternate.checked = progress.alternate;
    byId('progress-reset-note').hidden = !hasStarted(progress);
    keepAwake.checked = getKeepAwake();
    populateSeek(pattern, progress);
    renderControls();
    dialog.showModal();
  }

  for (const id of ['progress-settings', 'mobile-settings']) byId(id).addEventListener('click', open);
  function close() {
    dialog.close();
    focus();
  }
  byId('progress-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  keepAwake.addEventListener('change', () => setKeepAwake(keepAwake.checked));
  seekRow.addEventListener('input', updateSeekLimits);
  seekPoint.addEventListener('input', () => setText('seek-error', ''));
  byId('seek-form', 'form').addEventListener('submit', event => {
    event.preventDefault();
    const next = seekStitch(getPattern(), getProgress(), seekRow.valueAsNumber, seekPoint.valueAsNumber);
    if (!next) {
      setText('seek-error', 'Choose a stitch on your current path.');
      return;
    }
    applyStitch(next);
    close();
  });
  startRow.addEventListener('input', updateStartLimit);
  byId('progress-form', 'form').addEventListener('submit', event => {
    event.preventDefault();
    applyStart(newProgress(getPattern(), {
      row: startRow.valueAsNumber, col: startCol.valueAsNumber,
      direction: direction.value === 'ltr' ? 'ltr' : 'rtl', alternate: alternate.checked,
    }));
    close();
  });

  for (const action of actions) {
    byId('assign-' + action).addEventListener('click', () => {
      selected = action;
      setText('capture-title', action === 'advance' ? 'Set next stitch control' : 'Set previous stitch control');
      setText('capture-error', '');
      capture.showModal();
    });
    byId('clear-' + action).addEventListener('click', () => {
      const controls = { ...getControls() };
      delete controls[action];
      saveControls(controls);
      renderControls();
      byId('assign-' + action).focus();
    });
  }

  function assign(binding: Binding) {
    const controls = getControls();
    const other = selected === 'advance' ? 'back' : 'advance';
    if (sameBinding(controls[other], binding)) {
      setText('capture-error', 'This control is already assigned to the other action. Try another one.');
      return;
    }
    saveControls({ ...controls, [selected]: binding });
    renderControls();
    capture.close();
  }

  capture.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key === 'Escape' ||
      (event.target === byId('capture-cancel') && [' ', 'Enter'].includes(event.key))) return;
    const binding = keyBinding(event);
    if (!binding) return;
    event.preventDefault();
    if (!event.repeat) assign(binding);
  });

  function captureClick(event: MouseEvent) {
    if (!event.detail && event.type === 'click') return;
    if (event.button === 0 && event.target === byId('capture-cancel')) return;
    if (!isMouseButton(event.button)) return;
    event.preventDefault();
    assign({ kind: 'mouse', button: event.button });
  }
  capture.addEventListener('click', captureClick);
  capture.addEventListener('auxclick', captureClick);
  capture.addEventListener('pointerdown', event => { if (event.button === 1) event.preventDefault(); });
  capture.addEventListener('contextmenu', event => { if (event.button === 2) event.preventDefault(); });
}
