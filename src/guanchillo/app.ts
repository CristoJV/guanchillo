import {
  colorRun, counts, examplePattern, limits, newPattern, newProgress,
  deserializePattern, resizePattern, serializePattern, tileAt, totalSteps,
  type GridPosition, type Pattern, type Progress,
} from './model.js';
import { makeGrid, traceLine } from './grid.js';
import { createStorage, type Mode } from './storage.js';

function byId(id: string): HTMLElement;
function byId<Tag extends keyof HTMLElementTagNameMap>(id: string, tag: Tag): HTMLElementTagNameMap[Tag];
function byId(id: string, tag?: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element || (tag && element.localName !== tag)) throw new Error('Unexpected or missing element #' + id);
  return element;
}

const viewport = byId('viewport');
const surface = byId('grid-surface');
const workspace = byId('workspace');
const palette = byId('palette');
const cursorText = byId('grid-cursor');
const fileInput = byId('file-input', 'input');
const nameInput = byId('pattern-name', 'input');
const number = new Intl.NumberFormat('en');
const percent = new Intl.NumberFormat('en', { style: 'percent' });
const format = (value: number) => number.format(value);
const status = (message: string) => { byId('app-status').textContent = message; };
const setText = (id: string, value: string | number) => { byId(id).textContent = String(value); };
const storage = createStorage(message => {
  setText('storage-warning', message);
  byId('storage-warning').hidden = false;
});
const grid = makeGrid({
  viewport, surface, shell: byId('grid-shell'), top: byId('ruler-top'), left: byId('ruler-left'),
  colors: byId('grid-colors', 'canvas'), done: byId('grid-done', 'canvas'), marker: byId('grid-marker'), guide: byId('guide-row'),
  zoomOutput: byId('zoom-value'),
});

const patterns = storage.patterns();
const preferences = storage.preferences();
const sessions = new Map<string, Progress>();
const unsaved = new Set<string>();
type Tool = 'paint' | 'erase' | 'pan';
interface PaintAction {
  before?: Pattern;
}
interface Stroke extends PaintAction {
  type: 'stroke';
  id: number;
  last: GridPosition | null;
}
interface Pan extends GridPosition {
  type: 'pan';
  id: number;
  left: number;
  top: number;
}
let pattern: Pattern;
let progress: Progress;
let mode: Mode = preferences?.mode ?? 'edit';
let tool: Tool = 'paint';
let color = 0;
let editingColor: number | null = null;
let cursor: GridPosition = { x: 0, y: 0 };
let gesture: Stroke | Pan | null = null;
let clickOrigin: GridPosition | null = null;
const undo: Pattern[] = [];
const redo: Pattern[] = [];

function savePreferences() {
  storage.savePreferences({ activeId: pattern.id, mode });
}

function savePattern() {
  patterns.set(pattern.id, pattern);
  if (!storage.savePattern(pattern)) {
    unsaved.add(pattern.id);
    return false;
  }
  unsaved.delete(pattern.id);
  return storage.saveProgress(pattern.id, progress);
}

function renderPalette() {
  const fragment = document.createDocumentFragment();
  pattern.palette.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'palette-row';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'color-choice';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = entry.hex;
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const count = document.createElement('span');
    count.className = 'color-count';
    select.append(swatch, name, count);
    select.addEventListener('click', () => {
      color = index;
      setTool('paint');
      updateCounts();
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-button color-edit';
    edit.setAttribute('aria-label', 'Edit color ' + entry.name);
    edit.title = 'Edit color';
    edit.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#pencil"></use></svg>';
    edit.addEventListener('click', () => openColor(index));
    row.append(select, edit);
    fragment.append(row);
  });
  palette.replaceChildren(fragment);
  byId('color-add', 'button').disabled = pattern.palette.length >= limits.colors;
  updateCounts();
}

function updateCounts() {
  const stats = counts(pattern);
  for (const [index, row] of Array.from(palette.children).entries()) {
    const count = stats.colors[index];
    const selected = index === color;
    row.classList.toggle('selected', selected);
    const choice = row.firstElementChild;
    choice?.setAttribute('aria-pressed', String(selected));
    if (choice?.lastElementChild) choice.lastElementChild.textContent = format(count);
  }
  setText('empty-count', format(stats.empty));
}

function updateHistory() {
  byId('undo-action', 'button').disabled = !undo.length;
  byId('redo-action', 'button').disabled = !redo.length;
}

function refreshBoard() {
  const { rows, cols, cells } = pattern;
  setText('board-title', pattern.name);
  setText('board-meta', format(rows) + (rows === 1 ? ' row' : ' rows') + ' × ' +
    format(cols) + (cols === 1 ? ' column' : ' columns') + ' · ' +
    format(cells.length) + (cells.length === 1 ? ' stitch' : ' stitches'));
  nameInput.value = pattern.name;
  byId('rows', 'input').valueAsNumber = pattern.rows;
  byId('cols', 'input').valueAsNumber = pattern.cols;
  grid.drawPattern(pattern);
  renderPalette();
  updateHistory();
  refreshCursor();
}

function selectPattern(selected: Pattern, keepMode = false, initialProgress?: Progress) {
  finishGesture();
  pattern = selected;
  progress = initialProgress ?? sessions.get(pattern.id) ?? storage.progress(pattern);
  sessions.set(pattern.id, progress);
  cursor = { x: 0, y: pattern.rows - 1 };
  color = Math.min(1, pattern.palette.length - 1);
  undo.length = redo.length = 0;
  setTool('paint');
  if (initialProgress) savePattern();
  setMode(keepMode ? mode : 'edit');
  refreshBoard();
  grid.zoom(0);
  viewport.scrollTop = viewport.scrollLeft = 0;
  if (mode === 'work') grid.reveal();
}

function setMode(nextMode: Mode) {
  finishGesture();
  mode = nextMode;
  workspace.dataset.mode = mode;
  const working = mode === 'work';
  byId('edit-tools').hidden = byId('edit-details').hidden = working;
  byId('follow-panel').hidden = !working;
  byId('edit-mode').setAttribute('aria-pressed', String(!working));
  byId('work-mode').setAttribute('aria-pressed', String(working));
  setText('mode-title', working ? 'Follow pattern' : 'Pattern editor');
  setText('mode-summary', working ? 'Click the grid or press Space to advance.' :
    'Design your next tapestry crochet project.');
  setText('grid-shortcuts', working ? 'Space to advance · Left arrow to go back' :
    'Arrow keys to move · Space to paint');
  if (working) {
    grid.drawPattern(pattern);
    grid.setupProgress(progress);
    renderProgress();
  } else {
    grid.hideProgress();
    refreshCursor();
  }
  savePreferences();
}

function setTool(nextTool: Tool) {
  tool = nextTool;
  workspace.dataset.tool = tool;
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
  }
}

function remember(previous: Pattern) {
  undo.push(previous);
  if (undo.length > 40) undo.shift();
  redo.length = 0;
}

function applyChange(next: Pattern) {
  remember(pattern);
  replacePattern(next);
}

function replacePattern(next: Pattern) {
  const resized = next.rows !== pattern.rows || next.cols !== pattern.cols;
  pattern = next;
  if (resized) {
    progress = newProgress(pattern);
    sessions.set(pattern.id, progress);
    cursor = { x: Math.min(cursor.x, pattern.cols - 1), y: Math.min(cursor.y, pattern.rows - 1) };
  }
  color = Math.min(color, pattern.palette.length - 1);
  savePattern();
  refreshBoard();
}

// Resizing invalidates the saved stitch path, including when undoing a resize.
function approveResize(rows: number, cols: number) {
  if (rows === pattern.rows && cols === pattern.cols) return true;
  const defaultStart = newProgress(pattern);
  const changedStart = (['row', 'col', 'direction', 'alternate'] as const).some(key => progress[key] !== defaultStart[key]);
  if (progress.offset || changedStart) {
    return window.confirm('Resizing will reset your progress and starting point. Continue?');
  }
  if (rows < pattern.rows || cols < pattern.cols) {
    return window.confirm('Stitches outside the new grid will be cropped. Continue?');
  }
  return true;
}

function stepHistory(from: Pattern[], to: Pattern[]) {
  finishGesture();
  const previous = from.at(-1);
  if (!previous || !approveResize(previous.rows, previous.cols)) return;
  to.push(pattern);
  from.pop();
  replacePattern(previous);
}

function refreshCursor() {
  if (!pattern || mode !== 'edit') return;
  const focused = document.activeElement === surface;
  if (focused) {
    const { x, y } = cursor;
    const name = pattern.palette[pattern.cells[y * pattern.cols + x]]?.name ?? 'Unassigned';
    cursorText.textContent = 'Row ' + (pattern.rows - y) + ' · Column ' + (x + 1) + ' · ' + name;
    grid.mark(cursor);
  } else {
    cursorText.textContent = '';
    grid.mark(null);
  }
}

function renderProgress() {
  const total = totalSteps(progress);
  const ratio = progress.offset / total;
  const current = tileAt(progress, progress.offset);
  const entry = current ? pattern.palette[pattern.cells[current.index]] : null;
  const run = current ? colorRun(pattern, progress) : 0;
  setText('percent', percent.format(Math.floor(progress.offset * 100 / total) / 100));
  setText('done-count', format(progress.offset) + ' of ' + format(total) + (total === 1 ? ' stitch' : ' stitches'));
  byId('progress-bar', 'progress').value = ratio * 100;
  setText('current-heading', current ? 'Current stitch' : 'Pattern complete');
  setText('current-row', current?.row ?? '—');
  setText('current-point', current?.point ?? '—');
  setText('current-color', current ? entry?.name ?? 'Unassigned' : 'All stitches complete');
  setText('current-run', current && run ? run + (run === 1 ? ' stitch in this color' : ' stitches in this color') : '');
  setText('current-direction', current ? current.leftToRight ? 'Left to right' : 'Right to left' : '');
  const swatch = byId('current-swatch');
  swatch.hidden = !current;
  swatch.style.backgroundColor = entry?.hex ?? '#fbf8ef';
  byId('next-stitch', 'button').disabled = !current;
  byId('previous-stitch', 'button').disabled = progress.offset === 0;
  cursorText.textContent = current ?
    'Row ' + current.row + ' · Stitch ' + current.point + ' · ' + (entry?.name ?? 'Unassigned') + ' · ' + run + ' in a row' :
    'Pattern complete';
  grid.mark(current, true);
  grid.reveal();
}

function saveProgress() {
  if (!unsaved.has(pattern.id)) storage.saveProgress(pattern.id, progress);
}

function move(amount: -1 | 1) {
  if (mode !== 'work') return;
  const next = progress.offset + amount;
  if (next < 0 || next > totalSteps(progress)) return;
  grid.updateStep(progress, Math.min(next, progress.offset), amount > 0);
  progress.offset = next;
  saveProgress();
  renderProgress();
}

function paintAt(x: number, y: number, action: PaintAction) {
  const index = y * pattern.cols + x;
  const value = tool === 'erase' ? -1 : color;
  if (pattern.cells[index] === value) return;
  action.before ??= structuredClone(pattern);
  pattern.cells[index] = value;
  grid.paintCell(index);
}

function finishGesture() {
  if (!gesture) return;
  const before = gesture.type === 'stroke' ? gesture.before : undefined;
  gesture = null;
  workspace.classList.remove('is-panning');
  if (!before) return;
  remember(before);
  savePattern();
  updateCounts();
  updateHistory();
  refreshCursor();
}

viewport.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return;
  if (mode === 'work') {
    clickOrigin = { x: event.clientX, y: event.clientY };
    return;
  }
  if (tool === 'pan') {
    if (event.pointerType === 'touch') return;
    gesture = {
      type: 'pan', id: event.pointerId, x: event.clientX, y: event.clientY,
      left: viewport.scrollLeft, top: viewport.scrollTop,
    };
    workspace.classList.add('is-panning');
  } else {
    if (event.target !== surface) return;
    const tile = grid.positionAt(event);
    if (!tile) return;
    cursor = tile;
    surface.focus({ preventScroll: true });
    gesture = { type: 'stroke', id: event.pointerId, last: tile };
    paintAt(tile.x, tile.y, gesture);
  }
  event.preventDefault();
  viewport.setPointerCapture(event.pointerId);
});

viewport.addEventListener('pointermove', event => {
  const active = gesture;
  if (!active || active.id !== event.pointerId) return;
  if (active.type === 'pan') {
    viewport.scrollLeft = active.left + active.x - event.clientX;
    viewport.scrollTop = active.top + active.y - event.clientY;
  } else {
    const tile = grid.positionAt(event);
    if (!tile) {
      active.last = null;
      return;
    }
    traceLine(active.last ?? tile, tile, (x, y) => paintAt(x, y, active));
    active.last = cursor = tile;
    refreshCursor();
  }
});

for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  viewport.addEventListener(name, event => {
    if (gesture?.id === event.pointerId) finishGesture();
    if (name === 'pointercancel') clickOrigin = null;
  });
}

viewport.addEventListener('click', event => {
  if (mode !== 'work') return;
  const origin = clickOrigin;
  clickOrigin = null;
  if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) return;
  move(1);
});

window.addEventListener('pagehide', finishGesture);
surface.addEventListener('focus', refreshCursor);
surface.addEventListener('blur', refreshCursor);
const arrows = new Map([['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]], ['ArrowUp', [0, -1]], ['ArrowDown', [0, 1]]]);
const toolShortcuts = new Map<string, Tool>([['p', 'paint'], ['e', 'erase'], ['h', 'pan']]);

document.addEventListener('keydown', event => {
  const target = event.target;
  if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]') ||
    !(target instanceof Element) || target.closest('input, select, textarea, [contenteditable]')) return;

  if (mode === 'work') {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const keyboardClick = (event.key === ' ' || event.key === 'Enter') && !target.closest('button, a');
    if (keyboardClick || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (!event.repeat) move(event.key === 'ArrowLeft' ? -1 : 1);
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.key.toLowerCase() === 'y' || event.shiftKey) stepHistory(redo, undo);
    else stepHistory(undo, redo);
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const shortcut = toolShortcuts.get(event.key.toLowerCase());
  if (shortcut && (target === surface || target.closest('#edit-tools'))) setTool(shortcut);
  if (target !== surface) return;
  const arrow = arrows.get(event.key);
  if (arrow) {
    event.preventDefault();
    cursor = {
      x: Math.min(pattern.cols - 1, Math.max(0, cursor.x + arrow[0])),
      y: Math.min(pattern.rows - 1, Math.max(0, cursor.y + arrow[1])),
    };
    refreshCursor();
    grid.reveal();
  } else if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (event.repeat || tool === 'pan') return;
    const action: PaintAction = {};
    paintAt(cursor.x, cursor.y, action);
    if (!action.before) return;
    remember(action.before);
    savePattern();
    updateCounts();
    updateHistory();
    refreshCursor();
  }
});

function openColor(index: number | null = null) {
  editingColor = index;
  const entry = index === null ? undefined : pattern.palette[index];
  byId('color-name', 'input').value = entry?.name ?? '';
  byId('color-value', 'input').value = entry?.hex ?? '#739a8c';
  setText('color-dialog-title', entry ? 'Edit color' : 'Add color');
  byId('color-delete', 'button').hidden = !entry || pattern.palette.length === 1;
  byId('color-remove-note').hidden = index === null || pattern.palette.length === 1 || !pattern.cells.includes(index);
  byId('color-dialog', 'dialog').showModal();
}

function returnToColor(index: number) {
  const button = palette.children[index]?.querySelector('.color-choice');
  (button instanceof HTMLButtonElement ? button : byId('color-add', 'button')).focus();
}

byId('color-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = byId('color-name', 'input').value.trim();
  if (!name) {
    byId('color-name', 'input').value = '';
    byId('color-name', 'input').reportValidity();
    return;
  }
  const colors = pattern.palette.slice();
  const index = editingColor ?? colors.length;
  colors[index] = { name, hex: byId('color-value', 'input').value };
  color = index;
  applyChange({ ...pattern, palette: colors, cells: pattern.cells.slice() });
  setTool('paint');
  byId('color-dialog', 'dialog').close();
  returnToColor(index);
});

byId('color-delete', 'button').addEventListener('click', () => {
  if (editingColor === null || pattern.palette.length === 1) return;
  const removed = editingColor;
  const colors = pattern.palette.filter((_, index) => index !== removed);
  const cells = pattern.cells.map(value => value === removed ? -1 : value > removed ? value - 1 : value);
  color = color > removed ? color - 1 : Math.min(color, colors.length - 1);
  applyChange({ ...pattern, palette: colors, cells });
  byId('color-dialog', 'dialog').close();
  returnToColor(color);
});

function renderLibrary() {
  const list = byId('library-list');
  list.replaceChildren();
  for (const entry of [...patterns.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
    const item = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'button outline';
    open.type = 'button';
    const name = document.createElement('span');
    name.textContent = entry.name;
    const size = document.createElement('small');
    size.textContent = entry.rows + ' × ' + entry.cols;
    open.append(name, size);
    if (entry.id === pattern.id) open.setAttribute('aria-current', 'true');
    open.addEventListener('click', () => {
      byId('library-dialog', 'dialog').close();
      if (entry.id !== pattern.id) selectPattern(entry, true);
      if (mode === 'work') surface.focus({ preventScroll: true });
    });
    const remove = document.createElement('button');
    remove.className = 'icon-button danger';
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Delete pattern ' + entry.name);
    remove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#trash"></use></svg>';
    remove.addEventListener('click', () => {
      if (!window.confirm('Delete “' + entry.name + '” and its progress from this browser?')) return;
      if (!storage.removePattern(entry.id)) return;
      patterns.delete(entry.id);
      sessions.delete(entry.id);
      unsaved.delete(entry.id);
      if (entry.id === pattern.id) {
        const remaining = patterns.values().next().value;
        if (remaining) {
          selectPattern(remaining, true);
        } else {
          const blank = newPattern();
          selectPattern(blank, true, newProgress(blank));
        }
      }
      renderLibrary();
      (list.querySelector<HTMLButtonElement>('button[aria-current]') ?? byId('library-import')).focus();
      status('Pattern deleted.');
    });
    item.append(open, remove);
    list.append(item);
  }
}

async function importFile(file: File | undefined) {
  if (!file) return;
  if (file.size > limits.file) throw new Error('The file exceeds 1 MB.');
  const imported = deserializePattern(await file.text());
  if (byId('library-dialog', 'dialog').open) byId('library-dialog', 'dialog').close();
  selectPattern(imported.pattern, true, imported.progress);
  if (mode === 'work') surface.focus({ preventScroll: true });
  status('Opened “' + imported.pattern.name + '”.');
}

function exportPattern() {
  const contents = new Blob([serializePattern(pattern, progress)], { type: 'application/json' });
  const url = URL.createObjectURL(contents);
  const link = document.createElement('a');
  const slug = pattern.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  link.href = url;
  link.download = (slug || 'pattern') + '.ganchillo.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  status('Pattern and progress exported as JSON.');
}

byId('resize-form', 'form').addEventListener('submit', event => {
  event.preventDefault();
  const rows = byId('rows', 'input').valueAsNumber;
  const cols = byId('cols', 'input').valueAsNumber;
  if (rows === pattern.rows && cols === pattern.cols) return;
  if (approveResize(rows, cols)) applyChange(resizePattern(pattern, rows, cols));
  else {
    byId('rows', 'input').valueAsNumber = pattern.rows;
    byId('cols', 'input').valueAsNumber = pattern.cols;
  }
});

nameInput.addEventListener('change', () => {
  const name = nameInput.value.trim();
  nameInput.value = name || pattern.name;
  if (name && name !== pattern.name) {
    applyChange({ ...pattern, name, cells: pattern.cells.slice() });
  }
});

byId('create-form', 'form').addEventListener('submit', event => {
  event.preventDefault();
  const input = byId('new-name', 'input');
  const name = input.value.trim();
  if (!name) {
    input.value = '';
    input.reportValidity();
    return;
  }
  const fresh = newPattern(byId('new-rows', 'input').valueAsNumber, byId('new-cols', 'input').valueAsNumber, name);
  byId('pattern-dialog', 'dialog').close();
  selectPattern(fresh, false, newProgress(fresh));
  status('Created “' + fresh.name + '”.');
});

byId('progress-settings').addEventListener('click', () => {
  byId('start-row', 'input').max = String(pattern.rows);
  byId('start-col', 'input').max = String(pattern.cols);
  byId('start-row', 'input').valueAsNumber = progress.row;
  byId('start-col', 'input').valueAsNumber = progress.col;
  byId('start-direction', 'select').value = progress.direction;
  byId('start-alternate', 'input').checked = progress.alternate;
  byId('progress-reset-note').hidden = !progress.offset;
  byId('progress-dialog', 'dialog').showModal();
});

byId('progress-form').addEventListener('submit', event => {
  event.preventDefault();
  progress = newProgress(pattern, {
    row: byId('start-row', 'input').valueAsNumber,
    col: byId('start-col', 'input').valueAsNumber,
    direction: byId('start-direction', 'select').value === 'ltr' ? 'ltr' : 'rtl',
    alternate: byId('start-alternate', 'input').checked,
  });
  sessions.set(pattern.id, progress);
  saveProgress();
  byId('progress-dialog', 'dialog').close();
  grid.setupProgress(progress);
  renderProgress();
});

byId('new-pattern').addEventListener('click', () => {
  byId('create-form', 'form').reset();
  byId('pattern-dialog', 'dialog').showModal();
});
byId('library-open').addEventListener('click', () => {
  renderLibrary();
  byId('library-dialog', 'dialog').showModal();
});
byId('edit-mode').addEventListener('click', () => setMode('edit'));
byId('work-mode').addEventListener('click', () => {
  setMode('work');
  surface.focus({ preventScroll: true });
});
byId('next-stitch', 'button').addEventListener('click', () => move(1));
byId('previous-stitch', 'button').addEventListener('click', () => move(-1));
byId('undo-action', 'button').addEventListener('click', () => stepHistory(undo, redo));
byId('redo-action', 'button').addEventListener('click', () => stepHistory(redo, undo));
byId('color-add', 'button').addEventListener('click', () => openColor());
byId('save-pattern').addEventListener('click', () => {
  if (savePattern()) status('Saved “' + pattern.name + '” in this browser.');
});
byId('export-pattern').addEventListener('click', exportPattern);

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-close]')) {
  const id = button.dataset.close;
  if (id) button.addEventListener('click', () => byId(id, 'dialog').close());
}
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-tool]')) {
  const tool = button.dataset.tool;
  if (tool === 'paint' || tool === 'erase' || tool === 'pan') {
    button.addEventListener('click', () => setTool(tool));
  }
}
for (const id of ['import-open', 'library-import']) {
  byId(id).addEventListener('click', () => fileInput.click());
}
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  try {
    await importFile(file);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Could not open the file.');
  }
});
for (const [id, ratio] of [['zoom-in', 1.25], ['zoom-out', 0.8], ['zoom-fit', 0]] as const) {
  byId(id).addEventListener('click', () => {
    if (ratio === 0) viewport.scrollTop = viewport.scrollLeft = 0;
    grid.zoom(ratio);
  });
}

const initial = (preferences && patterns.get(preferences.activeId)) ?? patterns.values().next().value;
if (initial) {
  selectPattern(initial, true);
} else {
  const example = examplePattern();
  selectPattern(example, true, newProgress(example));
}
