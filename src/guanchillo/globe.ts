import { chartRow, type Pattern } from './model.js';

const turn = Math.PI * 2;
const neutral = [233, 220, 194];

export function makeGlobe(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return { show() {} };

  const size = canvas.width;
  const center = size / 2;
  const radius = center - 5;
  const frame = context.createImageData(size, size);
  const pixels: { index: number; x: number; y: number; z: number; light: number }[] = [];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - center) / radius;
      const y = (center - py - 0.5) / radius;
      const distance = x * x + y * y;
      if (distance >= 1) continue;
      const z = Math.sqrt(1 - distance);
      const light = 0.58 + 0.42 * Math.max(0, -0.37 * x + 0.47 * y + 0.8 * z);
      pixels.push({ index: 4 * (py * size + px), x, y, z, light });
    }
  }

  let pattern: Pattern;
  let rows: ReturnType<typeof chartRow>[];
  let palette: number[][];
  let yaw = 0.75;
  let pitch = -0.14;
  let requested = false;
  let drag: { id: number; x: number; y: number } | null = null;

  function render() {
    requested = false;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    for (const { index, x, y, z, light } of pixels) {
      const rotatedY = Math.min(1, Math.max(-1, y * cosPitch + z * sinPitch));
      const rotatedZ = z * cosPitch - y * sinPitch;
      const latitude = Math.min(pattern.rows - 0.0001, Math.acos(rotatedY) * pattern.rows / Math.PI);
      const row = rows[Math.floor(latitude)];
      const longitude = 0.5 + Math.atan2(x * cosYaw + rotatedZ * sinYaw, rotatedZ * cosYaw - x * sinYaw) / turn;
      const column = Math.min(row.stitches - 0.0001, longitude * row.stitches);
      const color = palette[pattern.cells[row.start + Math.floor(column)]] ?? neutral;
      const horizontalEdge = latitude % 1;
      const verticalEdge = column % 1;
      const seam = pattern.rows <= 42 && (horizontalEdge < 0.07 || verticalEdge < 0.065) ? 0.88 : 1;
      const shade = light * seam;
      frame.data[index] = color[0] * shade;
      frame.data[index + 1] = color[1] * shade;
      frame.data[index + 2] = color[2] * shade;
      frame.data[index + 3] = 255;
    }
    context?.putImageData(frame, 0, 0);
  }

  function schedule() {
    if (!requested) {
      requested = true;
      requestAnimationFrame(render);
    }
  }

  function rotate(x: number, y: number) {
    yaw = (yaw + x) % turn;
    pitch = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, pitch + y));
    schedule();
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    rotate((drag.x - event.clientX) * 0.012, (event.clientY - drag.y) * 0.012);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener('lostpointercapture', () => { drag = null; });
  const directions = new Map([
    ['ArrowLeft', [-0.18, 0]], ['ArrowRight', [0.18, 0]],
    ['ArrowUp', [0, -0.18]], ['ArrowDown', [0, 0.18]],
  ]);
  canvas.addEventListener('keydown', event => {
    const direction = directions.get(event.key);
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    rotate(direction[0], direction[1]);
  });

  return {
    show(next: Pattern) {
      pattern = next;
      rows = Array.from({ length: next.rows }, (_, y) => chartRow(next, y));
      palette = next.palette.map(({ hex }) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)));
      schedule();
    },
  };
}
