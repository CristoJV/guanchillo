import { chartRow, tileAt, type GridPosition, type Pattern, type Progress } from '../../core/model.js';
import { gores, projectedStitch, projectedX, specialStitches, sphereLayout } from '../../core/sphere.js';

interface GridElements {
  viewport: HTMLElement;
  shell: HTMLElement;
  top: HTMLElement;
  left: HTMLElement;
  surface: HTMLElement;
  referenceFrame: HTMLElement;
  referenceImage: HTMLImageElement;
  colors: HTMLCanvasElement;
  done: HTMLCanvasElement;
  marker: HTMLElement;
  guide: HTMLElement;
  lines: HTMLElement;
  zoomOutput: HTMLElement;
}

export interface GridReference extends GridPosition {
  url: string;
  width: number;
  height: number;
}

const blank = '#fbf8ef';
const progressPixels = 3;

function canvasContext(canvas: HTMLCanvasElement, options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Canvas 2D is unavailable.');
  return context;
}

export function makeGrid(elements: GridElements) {
  const { viewport, shell, top, left, surface, referenceFrame, referenceImage, colors, done, marker, guide, lines,
    zoomOutput } = elements;
  const ink = canvasContext(colors);
  const overlay = canvasContext(done);
  let pattern: Pattern;
  let scale = 1;
  let pitch = 1;
  let anchor: GridPosition | null = null;
  let direction: Progress['direction'] = 'rtl';
  let flipped = false;

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
    const sphere = pattern.shape === 'sphere';
    const width = Math.max(1, viewport.clientWidth - (sphere ? 114 : 58));
    const height = Math.max(1, viewport.clientHeight - 58);
    const fit = Math.max(0.8, Math.min(52, width / pattern.cols, height / pattern.rows));
    scale = Math.min(scale, 72 / fit);
    pitch = fit * scale;
    zoomOutput.textContent = Math.round(scale * 100) + '%';
    shell.style.setProperty('--pitch', pitch + 'px');
    shell.style.setProperty('--columns', String(pattern.cols));
    shell.style.setProperty('--rows', String(pattern.rows));
    shell.classList.toggle('fine', pitch < 7);
    shell.classList.toggle('hide-operations', pitch < 11);
    if (sphere) {
      const { rounds, goreWidth } = sphereLayout(pattern.rows);
      shell.style.setProperty('--gore-width', String(goreWidth));
      labelRuler(top, gores, goreWidth * pitch, flipped);
      const orderedRounds = flipped ? rounds : [...rounds].reverse();
      const labels = orderedRounds.map(round => {
        const label = document.createElement('span');
        if (round.number === 1 || round.number === pattern.rows ||
          round.number % Math.max(1, Math.ceil(15 / pitch)) === 0) {
          label.textContent = round.number + ' · ' + round.stitches;
        }
        return label;
      });
      left.replaceChildren(...labels);
    } else {
      labelRuler(top, pattern.cols, pitch, false);
      labelRuler(left, pattern.rows, pitch, true);
    }
  }

  function orientY(y: number) {
    return flipped ? pattern.rows - 1 - y : y;
  }

  function orientX(x: number, width: number) {
    return flipped ? pattern.cols - x - width : x;
  }

  function displayX(tile: GridPosition) {
    if (pattern.shape !== 'sphere') return tile.x;
    const { goreWidth, rounds } = sphereLayout(pattern.rows);
    return orientX(projectedX(goreWidth, rounds[pattern.rows - tile.y - 1], tile.x), 1);
  }

  function columnAt(x: number, y: number, nearest = false): number | null {
    if (pattern.shape !== 'sphere') return Math.floor(x);
    const { goreWidth, rounds } = sphereLayout(pattern.rows);
    const round = rounds[pattern.rows - y - 1];
    const column = projectedStitch(goreWidth, round, x, nearest);
    // The centered gores have the same outline when mirrored.
    return flipped && column !== null ? round.stitches - 1 - column : column;
  }

  function drawSphereLines() {
    const fragment = document.createDocumentFragment();
    function addSpan(className: string, x: number, y: number, length: number, symbol?: string) {
      if (length <= 0) return;
      const span = document.createElement('span');
      span.className = className;
      span.style.setProperty('--x', String(orientX(x, length)));
      span.style.setProperty('--y', String(orientY(y)));
      span.style.setProperty('--length', String(length));
      if (symbol) span.textContent = symbol;
      fragment.append(span);
    }

    if (pattern.shape === 'sphere') {
      const { rounds, goreWidth } = sphereLayout(pattern.rows);
      for (const round of rounds) {
        const y = pattern.rows - round.number;
        const specials = flipped ? null : specialStitches(round, direction === 'ltr');
        const width = round.kind === 'increase' ? 2 : 1;
        for (let gore = 0; gore < gores; gore++) {
          const x = projectedX(goreWidth, round, gore * round.perGore);
          addSpan('chart-strip', x, y, round.perGore);
          if (!specials) continue;
          const stitch = specials[gore];
          if (stitch === undefined) {
            addSpan('chart-singles', x, y, round.perGore);
          } else {
            const before = stitch - gore * round.perGore;
            addSpan('chart-singles', x, y, before);
            addSpan('chart-operation', x + before, y, width, round.kind === 'increase' ? 'V' : 'Λ');
            addSpan('chart-singles', x + before + width, y, round.perGore - before - width);
          }
        }
      }
    }
    lines.replaceChildren(fragment);
  }

  function paintCell(x: number, y: number) {
    const color = pattern.palette[pattern.cells[chartRow(pattern, y).start + x]];
    const horizontal = pattern.shape === 'sphere' ? 2 : 1;
    const left = displayX({ x, y }) * horizontal;
    const top = orientY(y);
    if (!color && !referenceFrame.hidden) {
      ink.clearRect(left, top, horizontal, 1);
    } else {
      ink.fillStyle = color?.hex ?? blank;
      ink.fillRect(left, top, horizontal, 1);
    }
  }

  function drawColors() {
    for (let y = 0; y < pattern.rows; y++) {
      const { stitches } = chartRow(pattern, y);
      for (let x = 0; x < stitches; x++) paintCell(x, y);
    }
  }

  function showReference(reference?: GridReference) {
    const wasHidden = referenceFrame.hidden;
    referenceFrame.hidden = !reference;
    if (reference) {
      if (referenceImage.getAttribute('src') !== reference.url) referenceImage.src = reference.url;
      const { rows, cols } = pattern;
      const scale = Math.min(cols / reference.width, rows / reference.height);
      const width = reference.width * scale;
      const height = reference.height * scale;
      referenceImage.style.width = `${100 * width / cols}%`;
      referenceImage.style.height = `${100 * height / rows}%`;
      referenceImage.style.left = `${100 * ((cols - width) / 2 + reference.x) / cols}%`;
      referenceImage.style.top = `${100 * ((rows - height) / 2 + reference.y) / rows}%`;
    } else {
      referenceImage.removeAttribute('src');
    }
    if (wasHidden !== referenceFrame.hidden) drawColors();
  }

  function drawPattern(next: Pattern, nextDirection: Progress['direction'], design: boolean) {
    const changedGeometry = !pattern || pattern.rows !== next.rows || pattern.cols !== next.cols || pattern.shape !== next.shape;
    const changedDirection = direction !== nextDirection;
    const nextFlipped = design && next.shape === 'sphere';
    const changedOrientation = flipped !== nextFlipped;
    pattern = next;
    direction = nextDirection;
    flipped = nextFlipped;
    if (changedGeometry) {
      shell.classList.toggle('sphere', pattern.shape === 'sphere');
      colors.width = pattern.cols * (pattern.shape === 'sphere' ? 2 : 1);
      colors.height = pattern.rows;
      done.width = colors.width * progressPixels;
      done.height = pattern.rows * progressPixels;
    }
    if (changedGeometry || changedOrientation) layout();
    if (changedGeometry || changedDirection || changedOrientation) drawSphereLines();
    drawColors();
  }

  function positionAt(event: MouseEvent): GridPosition | null {
    const rect = surface.getBoundingClientRect();
    const x = (event.clientX - rect.left) * pattern.cols / rect.width;
    const y = orientY(Math.floor((event.clientY - rect.top) * pattern.rows / rect.height));
    if (x < 0 || x >= pattern.cols || y < 0 || y >= pattern.rows) return null;
    const column = columnAt(x, y);
    return column === null ? null : { x: column, y };
  }

  function moveCursor(tile: GridPosition, dx: number, dy: number): GridPosition {
    const y = Math.min(pattern.rows - 1, Math.max(0, tile.y + (flipped ? -dy : dy)));
    const x = y === tile.y ? tile.x : columnAt(displayX(tile) + 0.5, y, true) ?? 0;
    return { x: Math.min(chartRow(pattern, y).stitches - 1, Math.max(0, x + (flipped ? -dx : dx))), y };
  }

  function traceStroke(from: GridPosition, to: GridPosition, visit: (x: number, y: number) => void) {
    if (pattern.shape !== 'sphere') {
      traceLine(from, to, visit);
      return;
    }
    traceLine({ x: displayX(from) * 2 + 1, y: from.y }, { x: displayX(to) * 2 + 1, y: to.y }, (x, y) => {
      const column = columnAt(x / 2, y);
      if (column !== null) visit(column, y);
    });
  }

  function mark(tile: GridPosition | null, showRow = false) {
    anchor = tile;
    marker.hidden = !tile;
    guide.hidden = !tile || !showRow;
    if (!tile) return;
    marker.style.setProperty('--x', String(displayX(tile)));
    marker.style.setProperty('--y', String(orientY(tile.y)));
    guide.style.setProperty('--y', String(orientY(tile.y)));
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
    const start = tileAt(pattern, progress, 0);
    if (!start) return;
    overlay.fillStyle = 'rgba(249,246,236,0.84)';
    for (let y = start.y; y < pattern.rows; y++) {
      const { stitches } = chartRow(pattern, y);
      const from = y === start.y && !start.leftToRight ? start.x + 1 : 0;
      const to = y === start.y && start.leftToRight ? start.x : stitches;
      for (let x = from; x < to; x++) {
        const width = (pattern.shape === 'sphere' ? 2 : 1) * progressPixels;
        overlay.fillRect(displayX({ x, y }) * width, orientY(y) * progressPixels, width, progressPixels);
      }
    }
    for (let offset = 0; offset < progress.offset; offset++) updateStep(progress, offset, true);
  }

  function updateStep(progress: Progress, offset: number, completed: boolean) {
    const tile = tileAt(pattern, progress, offset);
    if (!tile) return;
    const horizontal = pattern.shape === 'sphere' ? 2 : 1;
    const width = horizontal * progressPixels;
    const x = displayX(tile) * width;
    const y = orientY(tile.y) * progressPixels;
    if (completed) {
      overlay.fillStyle = 'rgba(31,55,46,0.47)';
      overlay.fillRect(x, y, width, progressPixels);
      overlay.fillStyle = 'rgba(255,252,241,0.92)';
      overlay.fillRect(x + horizontal, y + 1, horizontal, 1);
    } else {
      overlay.clearRect(x, y, width, progressPixels);
    }
  }

  new ResizeObserver(() => {
    if (pattern) {
      layout();
      reveal();
    }
  }).observe(viewport);

  return {
    drawPattern, paintCell, positionAt, moveCursor, traceStroke, mark, reveal, setupProgress, updateStep, showReference,
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
