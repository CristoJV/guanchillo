import { crochetStep } from './core/crochet.js';
import { deserializePattern, examplePattern, hasStarted, jumpToStitch, limits, makeColorGuide, newPattern, newProgress,
  serializePattern, totalSteps, type Pattern, type Progress } from './core/model.js';
import { makeScreenWakeLock } from './platform/screen-wake-lock.js';
import { createStorage, type Mode } from './platform/storage.js';
import { makeCatalog } from './views/catalog/catalog.js';
import { makeDesktopCrochet } from './views/crochet/desktop.js';
import { bindCrochetInput } from './views/crochet/input.js';
import { makeMobileCrochet } from './views/crochet/mobile.js';
import { bindCrochetSettings } from './views/crochet/settings.js';
import { makeEditor } from './views/editor/editor.js';
import { makeImageImporter } from './views/editor/image-import.js';
import { bindNewPattern } from './views/editor/new-pattern.js';
import { makeLibrary } from './views/library/library.js';
import { byId, setText, status } from './views/shared/dom.js';
import { makeGrid } from './views/shared/grid.js';
import { compactLayout } from './views/shared/layout.js';

const viewport = byId('viewport');
const surface = byId('grid-surface');
const workspace = byId('workspace');
const fileInput = byId('file-input', 'input');
const storage = createStorage(message => {
  setText('storage-warning', message);
  byId('storage-warning').hidden = false;
});
const grid = makeGrid({
  viewport, surface, shell: byId('grid-shell'), top: byId('ruler-top'), left: byId('ruler-left'),
  referenceFrame: byId('grid-reference'), referenceImage: byId('grid-reference-image', 'img'),
  colors: byId('grid-colors', 'canvas'), done: byId('grid-done', 'canvas'), marker: byId('grid-marker'), guide: byId('guide-row'),
  lines: byId('grid-lines'), zoomOutput: byId('zoom-value'),
});

const patterns = storage.patterns();
const preferences = storage.preferences();
const sessions = new Map<string, Progress>();
const unsaved = new Set<string>();
const compact = compactLayout();
let controls = storage.crochetControls();
let pattern: Pattern;
let progress: Progress;
let colorGuide: ReturnType<typeof makeColorGuide>;
let mode: Mode = preferences?.mode ?? 'edit';
let keepAwake = preferences?.keepAwake ?? false;
const screenWakeLock = makeScreenWakeLock(state => setText('screen-wake-status', state === 'active' ?
  'Screen is staying awake.' : state === 'unavailable' ? 'This device could not keep the screen awake.' : ''));

const editor = makeEditor({ viewport, surface, workspace, grid, savePattern, replacePattern });
const desktop = makeDesktopCrochet(grid, surface, move);
const mobile = makeMobileCrochet(move);
bindCrochetInput({
  isActive: () => mode === 'work', controls: () => controls, move, surface,
  jump(event) {
    const tile = grid.positionAt(event);
    if (!tile) return;
    const previous = progress;
    const next = jumpToStitch(pattern, previous, tile);
    if (next === previous) return;
    updateProgress(next);
    if (next.row !== previous.row || next.col !== previous.col) refreshTracking();
    else prepareCrochetView();
  },
});
bindCrochetSettings({
  getPattern: () => pattern, getProgress: () => progress,
  applyStart(next) {
    updateProgress(next);
    grid.drawPattern(pattern, progress.direction, false);
    refreshTracking();
  },
  applyStitch(next) {
    if (next === progress) return;
    updateProgress(next);
    prepareCrochetView();
  },
  getKeepAwake: () => keepAwake,
  setKeepAwake(next) {
    keepAwake = next;
    savePreferences();
    syncScreenWakeLock();
  },
  getControls: () => controls,
  saveControls(next) {
    controls = next;
    storage.saveCrochetControls(controls);
  },
  focus: focusCrochet,
});
bindNewPattern(fresh => selectPattern(fresh, 'edit', newProgress(fresh)));

const library = makeLibrary({
  patterns: () => patterns.values(),
  progress: entry => sessions.get(entry.id) ?? storage.progress(entry),
  currentId: () => pattern.id,
  open(entry, action) {
    if (entry.id === pattern.id) setMode(action);
    else selectPattern(entry, action);
    if (action === 'work') focusCrochet();
    else surface.focus({ preventScroll: true });
  },
  exportPattern,
  remove: removeFromLibrary,
});

const catalog = makeCatalog((template, action) => {
  const existing = patterns.get(template.id);
  if (existing?.id === pattern.id) setMode(action);
  else if (existing) selectPattern(existing, action);
  else {
    const copy = structuredClone(template);
    selectPattern(copy, action, newProgress(copy));
  }
  if (action === 'work') focusCrochet();
  else surface.focus({ preventScroll: true });
});
const imageImporter = makeImageImporter(imported => {
  selectPattern(imported, 'edit', newProgress(imported));
  status('Imported “' + imported.name + '” as a flat pattern.');
  surface.focus({ preventScroll: true });
}, (file, width, height) => {
  editor.addReference(file, width, height);
  setMode('edit');
  status('Reference image added.');
  surface.focus({ preventScroll: true });
});

function focusCrochet() {
  if (compact.matches) mobile.focus();
  else desktop.focus();
}

compact.addEventListener('change', () => {
  if (mode !== 'work') return;
  prepareCrochetView();
  if (document.activeElement === document.body && !document.querySelector('dialog[open]')) focusCrochet();
});

function savePreferences() {
  storage.savePreferences({ activeId: pattern.id, mode, keepAwake });
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

function selectPattern(selected: Pattern, nextMode: Mode = 'edit', initialProgress?: Progress) {
  editor.finishGesture();
  pattern = selected;
  progress = initialProgress ?? sessions.get(pattern.id) ?? storage.progress(pattern);
  sessions.set(pattern.id, progress);
  if (initialProgress) savePattern();
  editor.show(pattern, progress, nextMode === 'edit', true);
  setMode(nextMode);
  grid.zoom(0);
  viewport.scrollTop = viewport.scrollLeft = 0;
  if (mode === 'work') grid.reveal();
}

function replacePattern(next: Pattern) {
  const resized = next.rows !== pattern.rows || next.cols !== pattern.cols;
  pattern = next;
  if (resized) {
    progress = newProgress(pattern);
    sessions.set(pattern.id, progress);
  }
  savePattern();
  editor.show(pattern, progress, true);
}

function setMode(nextMode: Mode) {
  editor.finishGesture();
  const changed = mode !== nextMode;
  mode = nextMode;
  document.body.dataset.mode = workspace.dataset.mode = mode;
  const working = mode === 'work';
  const browsing = mode === 'catalog';
  workspace.hidden = browsing;
  byId('catalog-view').hidden = !browsing;
  byId('workbench-actions').hidden = browsing;
  byId('workbench-footer').hidden = browsing;
  byId('edit-mode').setAttribute('aria-pressed', String(mode === 'edit'));
  byId('work-mode').setAttribute('aria-pressed', String(working));
  byId('catalog-mode').setAttribute('aria-pressed', String(browsing));
  byId('mobile-settings').hidden = !working;
  byId('mobile-crochet').hidden = !working;
  byId('edit-tools').hidden = byId('edit-details').hidden = mode !== 'edit';
  byId('follow-panel').hidden = !working;
  byId('stitch-legend').hidden = !working;

  if (changed && pattern.shape === 'sphere') grid.drawPattern(pattern, progress.direction, mode === 'edit');
  if (!working) {
    grid.hideProgress();
    syncScreenWakeLock();
  }
  editor.setActive(mode === 'edit', progress);

  setText('mode-title', browsing ? 'Pattern catalog' : working ? 'Follow pattern' : 'Pattern editor');
  setText('mode-summary', browsing ? 'Choose a template to edit or crochet.' : working ?
    'Click a stitch to jump, or click beside the chart to advance.' : 'Design your next tapestry crochet project.');
  if (browsing) void catalog.show();
  if (working) {
    setText('grid-shortcuts', 'Space to start or advance · Left arrow to go back');
    refreshTracking();
  }
  savePreferences();
}

function refreshTracking() {
  colorGuide = makeColorGuide(pattern, progress);
  prepareCrochetView();
}

function prepareCrochetView() {
  if (!compact.matches) desktop.setup(progress);
  renderProgress();
}

function renderProgress() {
  const step = crochetStep(pattern, progress, colorGuide);
  if (compact.matches) mobile.render(pattern, progress, step);
  else desktop.render(step);
  syncScreenWakeLock();
}

function syncScreenWakeLock() {
  screenWakeLock.setEnabled(keepAwake && mode === 'work' && progress.offset < totalSteps(pattern, progress));
}

function saveProgress() {
  if (!unsaved.has(pattern.id)) storage.saveProgress(pattern.id, progress);
}

function updateProgress(next: Progress) {
  progress = next;
  sessions.set(pattern.id, next);
  saveProgress();
}

function move(amount: -1 | 1) {
  if (mode !== 'work') return;
  if (amount === 1 && !hasStarted(progress)) {
    progress.started = true;
  } else {
    const next = progress.offset + amount;
    if (next < 0 || next > totalSteps(pattern, progress)) return;
    if (!compact.matches) desktop.move(progress, next);
    progress.offset = next;
    progress.started = true;
  }
  saveProgress();
  renderProgress();
}

function removeFromLibrary(entry: Pattern) {
  if (!window.confirm('Delete “' + entry.name + '” and its progress from this browser?')) return false;
  if (!storage.removePattern(entry.id)) return false;
  patterns.delete(entry.id);
  sessions.delete(entry.id);
  unsaved.delete(entry.id);
  editor.removeReference(entry.id);
  if (entry.id === pattern.id) {
    const remaining = patterns.values().next().value;
    if (remaining) selectPattern(remaining, mode);
    else {
      const blank = newPattern();
      selectPattern(blank, mode, newProgress(blank));
    }
  }
  status('Pattern deleted.');
  return true;
}

async function importFile(file: File | undefined) {
  if (!file) return;
  if (file.size > limits.file) throw new Error('The file exceeds 1 MB.');
  const imported = deserializePattern(await file.text());
  if (byId('library-dialog', 'dialog').open) byId('library-dialog', 'dialog').close();
  selectPattern(imported.pattern, mode === 'work' ? 'work' : 'edit', imported.progress);
  if (mode === 'work') focusCrochet();
  status('Opened “' + imported.pattern.name + '”.');
}

function exportPattern(entry: Pattern, route: Progress) {
  try {
    const contents = new Blob([serializePattern(entry, route)], { type: 'application/json' });
    const url = URL.createObjectURL(contents);
    const link = document.createElement('a');
    const slug = entry.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.href = url;
    link.download = (slug || 'pattern') + '.guanchillo.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    status('Pattern and progress exported as JSON.');
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Could not export the pattern.');
  }
}

byId('library-open').addEventListener('click', () => {
  editor.finishGesture();
  library.show();
});
byId('edit-mode').addEventListener('click', () => setMode('edit'));
byId('catalog-mode').addEventListener('click', () => setMode('catalog'));
byId('image-open').addEventListener('click', imageImporter.open);
byId('work-mode').addEventListener('click', () => {
  setMode('work');
  focusCrochet();
});
byId('save-pattern').addEventListener('click', () => {
  if (savePattern()) status('Saved “' + pattern.name + '” in this browser.');
});
byId('export-pattern').addEventListener('click', () => exportPattern(pattern, progress));

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-close]')) {
  const id = button.dataset.close;
  if (id) button.addEventListener('click', () => byId(id, 'dialog').close());
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
  selectPattern(initial, mode);
} else {
  const example = examplePattern();
  selectPattern(example, mode, newProgress(example));
}
