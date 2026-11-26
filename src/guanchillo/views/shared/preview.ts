import type { Pattern } from '../../core/model.js';

export function drawFlatPreview(canvas: HTMLCanvasElement, pattern: Pick<Pattern, 'rows' | 'cols' | 'cells' | 'palette'>) {
  canvas.width = pattern.cols;
  canvas.height = pattern.rows;
  const context = canvas.getContext('2d');
  if (!context) return;
  for (const [index, value] of pattern.cells.entries()) {
    if (value === -1) continue;
    context.fillStyle = pattern.palette[value].hex;
    context.fillRect(index % pattern.cols, Math.floor(index / pattern.cols), 1, 1);
  }
}
