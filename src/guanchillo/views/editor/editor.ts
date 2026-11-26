import { chartRow, hasStarted, limits, newProgress, resizePattern, scaleFlatPattern, scaledFlatSize,
  type GridPosition, type Pattern, type Progress } from '../../core/model.js';
import { fitImageToGrid } from '../../core/image-pattern.js';
import { sphereSizes } from '../../core/sphere.js';
import { byId, format, setText, status } from '../shared/dom.js';
import { makeGlobe } from '../shared/globe.js';
import type { GridReference, makeGrid } from '../shared/grid.js';
import { compactLayout } from '../shared/layout.js';
import { makePalette } from './palette.js';

interface EditorOptions {
  viewport: HTMLElement;
  surface: HTMLElement;
  workspace: HTMLElement;
  grid: ReturnType<typeof makeGrid>;
  savePattern: () => boolean;
  replacePattern: (next: Pattern) => void;
}

export function makeEditor({ viewport, surface, workspace, grid, savePattern, replacePattern }: EditorOptions) {
  const palette = makePalette(applyChange, () => setTool('paint'));
  const cursorText = byId('grid-cursor');
  const nameInput = byId('pattern-name', 'input');
  const resizeForm = byId('resize-form', 'form');
  const rowsInput = byId('rows', 'input');
  const colsInput = byId('cols', 'input');
  const referenceVisible = byId('reference-visible', 'input');
  const referenceMove = byId('reference-move', 'button');
  const referenceCenter = byId('reference-center', 'button');
  const referenceFit = byId('reference-fit', 'button');
  const editorGlobe = makeGlobe(byId('editor-globe', 'canvas'));

  interface ReferenceLayer extends GridReference {
    visible: boolean;
  }
  const references = new Map<string, ReferenceLayer>();
  type Tool = 'paint' | 'erase' | 'pan' | 'reference';
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
  interface ReferenceDrag extends GridPosition {
    type: 'reference';
    id: number;
    layer: ReferenceLayer;
    start: GridPosition;
    scaleX: number;
    scaleY: number;
  }

  let tool: Tool = 'paint';
  let cursor: GridPosition = { x: 0, y: 0 };
  let gesture: Stroke | Pan | ReferenceDrag | null = null;
  const compact = compactLayout();
  const disclosures = workspace.querySelectorAll<HTMLDetailsElement>('.editor-disclosure');
  function arrangeDisclosures() {
    for (const disclosure of disclosures) disclosure.open = !compact.matches;
  }
  compact.addEventListener('change', arrangeDisclosures);
  arrangeDisclosures();

  const undo: Pattern[] = [];
  const redo: Pattern[] = [];

  let pattern: Pattern;
  let progress: Progress;
  let active = false;

  function updateHistory() {
    byId('undo-action', 'button').disabled = !undo.length;
    byId('redo-action', 'button').disabled = !redo.length;
  }

  function removeReference(id: string) {
    const layer = references.get(id);
    if (!layer) return;
    references.delete(id);
    URL.revokeObjectURL(layer.url);
  }

  function refreshReference() {
    const layer = references.get(pattern.id);
    const visible = layer?.visible === true;
    const canFit = layer && pattern.shape === 'flat';
    byId('reference-tools').hidden = !layer;
    referenceVisible.checked = visible;
    referenceMove.disabled = referenceCenter.disabled = !visible;
    referenceFit.hidden = byId('reference-fit-note').hidden = !canFit;
    if ((!visible || !active) && tool === 'reference') setTool('paint');
    grid.showReference(visible && active ? layer : undefined);
  }

  function moveReference(layer: ReferenceLayer, x: number, y: number) {
    layer.x = x;
    layer.y = y;
    if (layer.visible) grid.showReference(layer);
  }

  function refreshBoard() {
    const { rows, cols, cells } = pattern;
    const sphere = pattern.shape === 'sphere';
    setText('board-title', pattern.name);
    const dimensions = sphere ? format(rows) + ' rounds · ' + format(cols) + ' stitches at widest' :
      format(rows) + (rows === 1 ? ' row' : ' rows') + ' × ' + format(cols) + (cols === 1 ? ' column' : ' columns');
    setText('board-meta', dimensions + ' · ' + format(cells.length) + (cells.length === 1 ? ' stitch' : ' stitches'));
    setText('size-row-name', sphere ? 'Rounds' : 'Rows');
    byId('size-cols').hidden = sphere;
    byId('scale-open').hidden = sphere;
    byId('sphere-size-note').hidden = !sphere;
    byId('sphere-legend').hidden = !sphere;
    byId('editor-sphere-view').hidden = !sphere;
    nameInput.value = pattern.name;
    rowsInput.min = String(sphere ? sphereSizes.min : 1);
    rowsInput.max = String(sphere ? sphereSizes.max : limits.dimension);
    rowsInput.step = String(sphere ? sphereSizes.step : 1);
    rowsInput.valueAsNumber = rows;
    colsInput.disabled = sphere;
    colsInput.valueAsNumber = cols;
    grid.drawPattern(pattern, progress.direction, active);
    refreshReference();
    updateGlobe();
    updateHistory();
    refreshCursor();
  }

  function updateGridShortcuts() {
    setText('grid-shortcuts', tool === 'reference' ? 'Drag to move the image · Arrow keys to nudge' : 'Arrow keys to move · Space to paint');
  }

  function setTool(nextTool: Tool) {
    if (nextTool === 'reference' && !references.get(pattern.id)?.visible) return;
    if (nextTool !== tool) finishGesture();
    tool = nextTool;
    workspace.dataset.tool = tool;
    for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-tool]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    }
    updateGridShortcuts();
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

  // Resizing invalidates the saved stitch path, including when undoing a resize.
  function approveResize(rows: number, cols: number, scaling = false) {
    if (rows === pattern.rows && cols === pattern.cols) return true;
    const defaultStart = newProgress(pattern);
    const changedStart = (['row', 'col', 'direction', 'alternate'] as const).some(key => progress[key] !== defaultStart[key]);
    if (hasStarted(progress) || changedStart) {
      return window.confirm('Resizing will reset your progress and starting point. Continue?');
    }
    if (rows < pattern.rows || cols < pattern.cols) {
      if (scaling) return window.confirm('The drawing will be resampled to fit fewer stitches. Continue?');
      if (pattern.shape === 'sphere') return window.confirm('The colors will be resampled to fit fewer rounds. Continue?');
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
    if (!pattern || !active) return;
    cursorText.classList.remove('is-color-change');
    const focused = document.activeElement === surface && tool !== 'reference';
    if (focused) {
      const { x, y } = cursor;
      const { stitches, start } = chartRow(pattern, y);
      const name = pattern.palette[pattern.cells[start + x]]?.name ?? 'Unassigned';
      const row = pattern.rows - y;
      if (pattern.shape === 'sphere') {
        const point = progress.direction === 'ltr' ? x + 1 : stitches - x;
        cursorText.textContent = 'Round ' + row + ' · Stitch ' + point + ' of ' + stitches + ' · ' + name;
      } else {
        cursorText.textContent = 'Row ' + row + ' · Column ' + (x + 1) + ' · ' + name;
      }
      grid.mark(cursor);
    } else {
      cursorText.textContent = '';
      grid.mark(null);
    }
  }

  function updateGlobe() {
    if (pattern.shape === 'sphere') editorGlobe.show(pattern);
  }

  function paintAt(x: number, y: number, action: PaintAction) {
    const index = chartRow(pattern, y).start + x;
    const value = tool === 'erase' ? -1 : palette.selected();
    if (pattern.cells[index] === value) return;
    action.before ??= structuredClone(pattern);
    pattern.cells[index] = value;
    grid.paintCell(x, y);
  }

  function finishGesture() {
    if (!gesture) return;
    const before = gesture.type === 'stroke' ? gesture.before : undefined;
    gesture = null;
    workspace.classList.remove('is-panning');
    if (!before) return;
    remember(before);
    savePattern();
    palette.updateCounts();
    updateHistory();
    refreshCursor();
  }

  function cancelGesture() {
    const canceled = gesture;
    if (!canceled) return;
    gesture = null;
    workspace.classList.remove('is-panning');
    if (viewport.hasPointerCapture(canceled.id)) viewport.releasePointerCapture(canceled.id);
    if (canceled.type === 'stroke' && canceled.before) {
      pattern.cells = canceled.before.cells;
      grid.drawPattern(pattern, progress.direction, true);
      updateGlobe();
      palette.updateCounts();
    } else if (canceled.type === 'reference') {
      moveReference(canceled.layer, canceled.start.x, canceled.start.y);
    } else if (canceled.type === 'pan') {
      viewport.scrollLeft = canceled.left;
      viewport.scrollTop = canceled.top;
    }
    refreshCursor();
  }

  viewport.addEventListener('pointerdown', event => {
    if (!active || event.button !== 0 || !event.isPrimary || gesture) return;
    if (tool === 'pan') {
      if (event.pointerType === 'touch') return;
      gesture = {
        type: 'pan', id: event.pointerId, x: event.clientX, y: event.clientY,
        left: viewport.scrollLeft, top: viewport.scrollTop,
      };
      workspace.classList.add('is-panning');
    } else if (tool === 'reference') {
      const layer = references.get(pattern.id);
      if (event.target !== surface || !layer?.visible) return;
      const { width, height } = surface.getBoundingClientRect();
      gesture = {
        type: 'reference', id: event.pointerId, x: event.clientX, y: event.clientY, layer,
        start: { x: layer.x, y: layer.y }, scaleX: pattern.cols / width, scaleY: pattern.rows / height,
      };
      surface.focus({ preventScroll: true });
      workspace.classList.add('is-panning');
    } else {
      if (event.target !== surface) return;
      const tile = grid.positionAt(event);
      if (!tile) return;
      cursor = tile;
      surface.focus({ preventScroll: true });
      gesture = { type: 'stroke', id: event.pointerId, last: tile };
      paintAt(tile.x, tile.y, gesture);
      if (gesture.before) updateGlobe();
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
    } else if (active.type === 'reference') {
      moveReference(active.layer, active.start.x + (event.clientX - active.x) * active.scaleX,
        active.start.y + (event.clientY - active.y) * active.scaleY);
    } else {
      const tile = grid.positionAt(event);
      if (!tile) {
        active.last = null;
        return;
      }
      grid.traceStroke(active.last ?? tile, tile, (x, y) => paintAt(x, y, active));
      active.last = cursor = tile;
      if (active.before) updateGlobe();
      refreshCursor();
    }
  });

  viewport.addEventListener('pointerup', event => {
    if (gesture?.id === event.pointerId) finishGesture();
  });
  for (const name of ['pointercancel', 'lostpointercapture'] as const) {
    viewport.addEventListener(name, event => {
      if (gesture?.id === event.pointerId) cancelGesture();
    });
  }

  window.addEventListener('pagehide', cancelGesture);
  surface.addEventListener('focus', refreshCursor);
  surface.addEventListener('blur', refreshCursor);
  const arrows = new Map([['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]], ['ArrowUp', [0, -1]], ['ArrowDown', [0, 1]]]);
  const toolShortcuts = new Map<string, Tool>([['p', 'paint'], ['e', 'erase'], ['h', 'pan'], ['r', 'reference']]);

  document.addEventListener('keydown', event => {
    const target = event.target;
    if (!active || event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]') ||
      !(target instanceof Element) || target.closest('input, select, textarea, [contenteditable]')) return;

    if (event.key === 'Escape' && gesture) {
      event.preventDefault();
      cancelGesture();
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
    if (shortcut && (target === surface || target.closest('#edit-tools'))) {
      setTool(shortcut);
      refreshCursor();
    }
    if (target !== surface) return;
    const arrow = arrows.get(event.key);
    if (arrow) {
      event.preventDefault();
      if (tool === 'reference') {
        const layer = references.get(pattern.id);
        if (layer) moveReference(layer, layer.x + arrow[0], layer.y + arrow[1]);
        return;
      }
      cursor = grid.moveCursor(cursor, arrow[0], arrow[1]);
      refreshCursor();
      grid.reveal();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (event.repeat || tool === 'pan' || tool === 'reference') return;
      const action: PaintAction = {};
      paintAt(cursor.x, cursor.y, action);
      if (!action.before) return;
      remember(action.before);
      savePattern();
      updateGlobe();
      palette.updateCounts();
      updateHistory();
      refreshCursor();
    }
  });

  function resizeTo(rows: number, cols: number) {
    if (rows === pattern.rows && cols === pattern.cols) return true;
    if (!approveResize(rows, cols)) return false;
    applyChange(resizePattern(pattern, rows, cols));
    return true;
  }

  resizeForm.addEventListener('submit', event => {
    event.preventDefault();
    const rows = rowsInput.valueAsNumber;
    const cols = pattern.shape === 'sphere' ? rows * 2 : colsInput.valueAsNumber;
    if (!resizeTo(rows, cols)) {
      rowsInput.valueAsNumber = pattern.rows;
      colsInput.valueAsNumber = pattern.cols;
    }
  });

  const scaleDialog = byId('scale-dialog', 'dialog');
  const scaleForm = byId('scale-form', 'form');
  const scaleLink = byId('scale-link', 'button');
  const scaleAll = byId('scale-all', 'select');
  const scaleX = byId('scale-x', 'select');
  const scaleY = byId('scale-y', 'select');
  let scaleLinked = true;

  function setScaleChoices(select: HTMLSelectElement, length: number) {
    const options: HTMLOptionElement[] = [];
    for (let divisor = length; divisor >= 2; divisor--) options.push(new Option(`÷${divisor}`, String(-divisor)));
    for (let factor = 1; factor <= limits.dimension / length; factor++) options.push(new Option(`×${factor}`, String(factor)));
    select.replaceChildren(...options);
    select.value = '1';
  }

  function scaleFactors() {
    return { x: Number((scaleLinked ? scaleAll : scaleX).value), y: Number((scaleLinked ? scaleAll : scaleY).value) };
  }

  function updateScaleForm() {
    byId('scale-all-field').hidden = !scaleLinked;
    byId('scale-axes').hidden = scaleLinked;
    scaleLink.setAttribute('aria-pressed', String(scaleLinked));
    scaleLink.querySelector('use')?.setAttribute('href', scaleLinked ? '#link' : '#unlink');
    const { x, y } = scaleFactors();
    const { cols, rows } = scaledFlatSize(pattern, x, y);
    setText('scale-size', `${cols} columns × ${rows} rows`);
    byId('scale-apply', 'button').disabled = rows === pattern.rows && cols === pattern.cols;
  }

  byId('scale-open').addEventListener('click', () => {
    if (pattern.shape !== 'flat') return;
    setScaleChoices(scaleAll, Math.max(pattern.rows, pattern.cols));
    setScaleChoices(scaleX, pattern.cols);
    setScaleChoices(scaleY, pattern.rows);
    scaleLinked = true;
    updateScaleForm();
    scaleDialog.showModal();
  });
  scaleLink.addEventListener('click', () => {
    if (scaleLinked) {
      const factor = Number(scaleAll.value);
      for (const [select, length] of [[scaleX, pattern.cols], [scaleY, pattern.rows]] as const) {
        select.value = String(length === 1 && factor < 0 ? 1 : Math.max(-length, factor));
      }
    } else if (scaleX.value === scaleY.value) {
      scaleAll.value = scaleX.value;
    }
    scaleLinked = !scaleLinked;
    updateScaleForm();
  });
  scaleForm.addEventListener('change', updateScaleForm);
  scaleForm.addEventListener('submit', event => {
    event.preventDefault();
    const { x, y } = scaleFactors();
    const { rows, cols } = scaledFlatSize(pattern, x, y);
    if ((rows === pattern.rows && cols === pattern.cols) || !approveResize(rows, cols, true)) return;
    applyChange(scaleFlatPattern(pattern, x, y));
    scaleDialog.close();
    status(`Design scaled to ${cols} × ${rows} stitches.`);
  });

  referenceFit.addEventListener('click', () => {
    const layer = references.get(pattern.id);
    if (!layer || pattern.shape !== 'flat' || !resizeForm.reportValidity()) return;
    const { rows, cols } = fitImageToGrid(layer.width, layer.height, {
      rows: rowsInput.valueAsNumber, cols: colsInput.valueAsNumber,
    });
    if (!resizeTo(rows, cols)) return;
    rowsInput.valueAsNumber = rows;
    colsInput.valueAsNumber = cols;
    moveReference(layer, 0, 0);
    status(`Grid fitted to the image at ${cols} × ${rows} stitches.`);
  });

  referenceVisible.addEventListener('change', () => {
    const layer = references.get(pattern.id);
    if (!layer) return;
    layer.visible = referenceVisible.checked;
    refreshReference();
  });
  referenceCenter.addEventListener('click', () => {
    const layer = references.get(pattern.id);
    if (layer) moveReference(layer, 0, 0);
  });
  byId('reference-remove').addEventListener('click', () => {
    removeReference(pattern.id);
    refreshReference();
    status('Reference image removed.');
    surface.focus({ preventScroll: true });
  });

  nameInput.addEventListener('change', () => {
    const name = nameInput.value.trim();
    nameInput.value = name || pattern.name;
    if (name && name !== pattern.name) {
      applyChange({ ...pattern, name, cells: pattern.cells.slice() });
    }
  });

  byId('undo-action', 'button').addEventListener('click', () => stepHistory(undo, redo));
  byId('redo-action', 'button').addEventListener('click', () => stepHistory(redo, undo));
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-tool]')) {
    const tool = button.dataset.tool;
    if (tool === 'paint' || tool === 'erase' || tool === 'pan' || tool === 'reference') {
      button.addEventListener('click', () => {
        setTool(tool);
        if (tool === 'reference') surface.focus({ preventScroll: true });
      });
    }
  }

  function show(next: Pattern, route: Progress, editing: boolean, selected = false) {
    pattern = next;
    progress = route;
    active = editing;
    if (selected) {
      const y = pattern.rows - 1;
      cursor = { x: pattern.shape === 'sphere' ? chartRow(pattern, y).stitches - 1 : 0, y };
      undo.length = redo.length = 0;
      setTool('paint');
    } else {
      const y = Math.min(cursor.y, pattern.rows - 1);
      cursor = { x: Math.min(cursor.x, chartRow(pattern, y).stitches - 1), y };
    }
    palette.show(pattern, selected);
    refreshBoard();
  }

  function setActive(editing: boolean, route: Progress) {
    active = editing;
    progress = route;
    refreshReference();
    if (active) {
      updateGridShortcuts();
      refreshCursor();
    }
  }

  function addReference(file: File, width: number, height: number) {
    removeReference(pattern.id);
    references.set(pattern.id, { url: URL.createObjectURL(file), width, height, x: 0, y: 0, visible: true });
  }

  return { show, setActive, finishGesture, addReference, removeReference };
}
