import { tileAt, type GridPosition, type Pattern, type Progress } from './model.js';

interface GridElements {
  viewport: HTMLElement;
  shell: HTMLElement;
  top: HTMLElement;
  left: HTMLElement;
  surface: HTMLElement;
  colors: HTMLCanvasElement;
  done: HTMLCanvasElement;
  marker: HTMLElement;
  guide: HTMLElement;
  zoomOutput: HTMLElement;
}

const blank = '#fbf8ef';
const progressPixels = 3;

function canvasContext(canvas: HTMLCanvasElement, options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Canvas 2D is unavailable.');
  return context;
}

export function makeGrid(elements: GridElements) {
  const { viewport, shell, top, left, surface, colors, done, marker, guide, zoomOutput } = elements;
  const ink = canvasContext(colors, { alpha: false });
  const overlay = canvasContext(done);
  let pattern: Pattern;
  let scale = 1;
  let pitch = 1;
  let anchor: GridPosition | null = null;

  function labelRuler(element: HTMLElement, count: number, available: number, descending: boolean) {
    const step = Math.max(1, Math.ceil(24 / available));
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < count; index++) {
      const value = descending ? count - index : index + 1;
      const label = document.createElement('span');
      if (available >= 9 && (value === 1 || value % step === 0 || (step === 1 && value === count))) {
        label.textContent = String(value);
      }
      fragment.append(label);
    }
    element.replaceChildren(fragment);
  }

  function layout() {
    const width = Math.max(1, viewport.clientWidth - 58);
    const height = Math.max(1, viewport.clientHeight - 58);
    const fit = Math.max(0.8, Math.min(52, width / pattern.cols, height / pattern.rows));
    scale = Math.min(scale, 72 / fit);
    pitch = fit * scale;
    zoomOutput.textContent = Math.round(scale * 100) + '%';
    shell.style.setProperty('--pitch', pitch + 'px');
    shell.style.setProperty('--columns', String(pattern.cols));
    shell.style.setProperty('--rows', String(pattern.rows));
    shell.classList.toggle('fine', pitch < 7);
    labelRuler(top, pattern.cols, pitch, false);
    labelRuler(left, pattern.rows, pitch, true);
  }

  function paintCell(index: number) {
    const color = pattern.palette[pattern.cells[index]];
    ink.fillStyle = color?.hex ?? blank;
    ink.fillRect(index % pattern.cols, Math.floor(index / pattern.cols), 1, 1);
  }

  function drawPattern(next: Pattern) {
    pattern = next;
    if (colors.width !== pattern.cols || colors.height !== pattern.rows || !shell.style.getPropertyValue('--pitch')) {
      colors.width = pattern.cols;
      colors.height = pattern.rows;
      done.width = pattern.cols * progressPixels;
      done.height = pattern.rows * progressPixels;
      layout();
    }
    for (let index = 0; index < pattern.cells.length; index++) paintCell(index);
  }

  function positionAt(event: PointerEvent): GridPosition | null {
    const rect = surface.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * pattern.cols / rect.width);
    const y = Math.floor((event.clientY - rect.top) * pattern.rows / rect.height);
    return x >= 0 && y >= 0 && x < pattern.cols && y < pattern.rows ? { x, y } : null;
  }

  function mark(tile: GridPosition | null, showRow = false) {
    anchor = tile;
    marker.hidden = !tile;
    guide.hidden = !tile || !showRow;
    if (!tile) return;
    marker.style.setProperty('--x', String(tile.x));
    marker.style.setProperty('--y', String(tile.y));
    guide.style.setProperty('--y', String(tile.y));
  }

  function reveal() {
    if (!anchor) return;
    const box = marker.getBoundingClientRect();
    const frame = viewport.getBoundingClientRect();
    const margin = Math.min(pitch, 22);
    if (box.left < frame.left + margin) viewport.scrollLeft += box.left - frame.left - margin;
    if (box.right > frame.right - margin) viewport.scrollLeft += box.right - frame.right + margin;
    if (box.top < frame.top + margin) viewport.scrollTop += box.top - frame.top - margin;
    if (box.bottom > frame.bottom - margin) viewport.scrollTop += box.bottom - frame.bottom + margin;
  }

  function setupProgress(progress: Progress) {
    done.hidden = false;
    overlay.clearRect(0, 0, done.width, done.height);
    const start = tileAt(progress, 0);
    if (!start) return;
    overlay.fillStyle = 'rgba(249,246,236,0.84)';
    const y = start.y * progressPixels;
    const x = start.x * progressPixels;
    overlay.fillRect(0, y + progressPixels, done.width, done.height - y - progressPixels);
    if (start.leftToRight) overlay.fillRect(0, y, x, progressPixels);
    else overlay.fillRect(x + progressPixels, y, done.width - x - progressPixels, progressPixels);
    for (let offset = 0; offset < progress.offset; offset++) updateStep(progress, offset, true);
  }

  function updateStep(progress: Progress, offset: number, completed: boolean) {
    const tile = tileAt(progress, offset);
    if (!tile) return;
    const x = tile.x * progressPixels;
    const y = tile.y * progressPixels;
    if (completed) {
      overlay.fillStyle = 'rgba(31,55,46,0.47)';
      overlay.fillRect(x, y, progressPixels, progressPixels);
      overlay.fillStyle = 'rgba(255,252,241,0.92)';
      overlay.fillRect(x + 1, y + 1, 1, 1);
    } else {
      overlay.clearRect(x, y, progressPixels, progressPixels);
    }
  }

  new ResizeObserver(() => {
    if (pattern) {
      layout();
      reveal();
    }
  }).observe(viewport);

  return {
    drawPattern, paintCell, positionAt, mark, reveal, setupProgress, updateStep,
    hideProgress() { done.hidden = true; },
    zoom(amount: number) {
      scale = Math.max(0.5, Math.min(32, amount === 0 ? 1 : scale * amount));
      if (Math.abs(scale - 1) < 0.025) scale = 1;
      layout();
      reveal();
    },
  };
}

// Fill gaps between pointer events during a fast drag.
export function traceLine(from: GridPosition, to: GridPosition, visit: (x: number, y: number) => void) {
  const dx = Math.abs(to.x - from.x);
  const dy = -Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let { x, y } = from;
  let error = dx + dy;
  while (true) {
    visit(x, y);
    if (x === to.x && y === to.y) return;
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
}
