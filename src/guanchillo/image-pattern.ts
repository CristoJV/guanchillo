import { limits, type Pattern } from './model.js';

type RGB = [number, number, number];

interface Sample {
  rgb: RGB;
  weight: number;
}

interface Box {
  samples: Sample[];
  weight: number;
  channel: 0 | 1 | 2;
  spread: number;
}

function boxFor(samples: Sample[]): Box {
  const min: RGB = [255, 255, 255];
  const max: RGB = [0, 0, 0];
  let weight = 0;
  for (const sample of samples) {
    weight += sample.weight;
    for (const channel of [0, 1, 2] as const) {
      min[channel] = Math.min(min[channel], sample.rgb[channel]);
      max[channel] = Math.max(max[channel], sample.rgb[channel]);
    }
  }
  let channel: Box['channel'] = 0;
  for (const axis of [1, 2] as const) {
    if (max[axis] - min[axis] > max[channel] - min[channel]) channel = axis;
  }
  return { samples, weight, channel, spread: max[channel] - min[channel] };
}

function medianCut(samples: Sample[], limit: number): RGB[] {
  if (!samples.length) return [[244, 234, 212]];
  const boxes = [boxFor(samples)];
  while (boxes.length < limit) {
    let splitIndex = -1;
    let priority = 0;
    for (const [index, box] of boxes.entries()) {
      const score = box.spread * Math.sqrt(box.weight);
      if (box.samples.length > 1 && score > priority) {
        priority = score;
        splitIndex = index;
      }
    }
    if (splitIndex === -1) break;
    const { samples, channel, weight } = boxes[splitIndex];
    samples.sort((a, b) => a.rgb[channel] - b.rgb[channel]);
    let split = 1;
    let leftWeight = samples[0].weight;
    while (split < samples.length - 1 && leftWeight < weight / 2) {
      leftWeight += samples[split].weight;
      split++;
    }
    boxes.splice(splitIndex, 1, boxFor(samples.slice(0, split)), boxFor(samples.slice(split)));
  }

  // Keep exact source colors whenever they already fit in the requested palette.
  const unique = new Map<string, RGB>();
  for (const { samples, weight } of boxes) {
    const rgb: RGB = [0, 0, 0];
    for (const sample of samples) {
      for (const channel of [0, 1, 2] as const) rgb[channel] += sample.rgb[channel] * sample.weight;
    }
    const average: RGB = [Math.round(rgb[0] / weight), Math.round(rgb[1] / weight), Math.round(rgb[2] / weight)];
    unique.set(hex(average), average);
  }
  return [...unique.values()];
}

function hex(rgb: RGB) {
  return '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('');
}

function parseHex(value: string): RGB {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Choose six-digit hex colors.');
  return [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16)) as RGB;
}

function nearestColor(rgb: RGB, palette: RGB[]): number {
  let nearest = 0;
  let distance = Infinity;
  for (const [index, [red, green, blue]] of palette.entries()) {
    const meanRed = (rgb[0] + red) / 2;
    const delta = (2 + meanRed / 256) * (rgb[0] - red) ** 2 + 4 * (rgb[1] - green) ** 2 +
      (2 + (255 - meanRed) / 256) * (rgb[2] - blue) ** 2;
    if (delta < distance) {
      nearest = index;
      distance = delta;
    }
  }
  return nearest;
}

export function quantizeImage(pixels: Uint8ClampedArray, colors: number | string[]): Pick<Pattern, 'palette' | 'cells'> {
  const colorCount = typeof colors === 'number' ? colors : colors.length;
  if (!Number.isInteger(colorCount) || colorCount < 1 || colorCount > limits.colors) {
    throw new Error('Choose between 1 and 24 colors.');
  }

  const histogram = new Map<number, Sample>();
  const keys: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) {
      keys.push(-1);
      continue;
    }
    const rgb: RGB = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    keys.push(key);
    const sample = histogram.get(key);
    if (sample) sample.weight++;
    else histogram.set(key, { rgb, weight: 1 });
  }

  const rgbPalette = typeof colors === 'number' ? medianCut([...histogram.values()], colors) : colors.map(parseHex);
  const colorsByPixel = new Map<number, number>();
  for (const [key, { rgb }] of histogram) colorsByPixel.set(key, nearestColor(rgb, rgbPalette));
  return {
    palette: rgbPalette.map((rgb, index) => ({ name: 'Color ' + (index + 1), hex: hex(rgb) })),
    cells: keys.map(key => colorsByPixel.get(key) ?? -1),
  };
}
