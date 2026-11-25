import { counts, limits, type Dimensions, type Pattern } from './model.js';

export function fitImageToGrid(width: number, height: number, bounds: Dimensions): Dimensions {
  const scale = Math.min(bounds.cols / width, bounds.rows / height);
  return { rows: Math.max(1, Math.round(height * scale)), cols: Math.max(1, Math.round(width * scale)) };
}

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

function colorDistance(rgb: RGB, [red, green, blue]: RGB): number {
  const meanRed = (rgb[0] + red) / 2;
  return (2 + meanRed / 256) * (rgb[0] - red) ** 2 + 4 * (rgb[1] - green) ** 2 +
    (2 + (255 - meanRed) / 256) * (rgb[2] - blue) ** 2;
}

function nearestColor(rgb: RGB, palette: RGB[]): number {
  let nearest = 0;
  let distance = Infinity;
  for (const [index, color] of palette.entries()) {
    const delta = colorDistance(rgb, color);
    if (delta < distance) {
      nearest = index;
      distance = delta;
    }
  }
  return nearest;
}

function checkColorCount(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > limits.colors) {
    throw new Error('Choose between 1 and ' + limits.colors + ' colors.');
  }
}

export function reducePatternPalette(pattern: Pattern, limit: number): Pick<Pattern, 'palette' | 'cells'> {
  checkColorCount(limit);
  const frequency = counts(pattern).colors;
  const groups = pattern.palette.map(({ hex }, index) => ({
    index, rgb: parseHex(hex), weight: frequency[index], members: [index],
  })).filter(group => group.weight > 0);
  if (!groups.length) return { palette: [pattern.palette[0]], cells: pattern.cells };

  while (groups.length > limit) {
    let best = Infinity;
    let merge = [0, 1];
    for (let left = 0; left < groups.length - 1; left++) {
      for (let right = left + 1; right < groups.length; right++) {
        const a = groups[left];
        const b = groups[right];
        const cost = colorDistance(a.rgb, b.rgb) * a.weight * b.weight / (a.weight + b.weight);
        if (cost < best) {
          best = cost;
          merge = [left, right];
        }
      }
    }
    const [left, right] = merge;
    const [keep, remove] = groups[left].weight >= groups[right].weight ? [left, right] : [right, left];
    groups[keep].weight += groups[remove].weight;
    groups[keep].members.push(...groups[remove].members);
    groups.splice(remove, 1);
  }
  const colorMap = new Map<number, number>();
  for (const [index, group] of groups.entries()) {
    for (const member of group.members) colorMap.set(member, index);
  }
  return {
    palette: groups.map(({ index }) => pattern.palette[index]),
    cells: pattern.cells.map(cell => colorMap.get(cell) ?? -1),
  };
}

export function quantizeImage(pixels: Uint8ClampedArray, colors: number | string[]): Pick<Pattern, 'palette' | 'cells'> {
  checkColorCount(typeof colors === 'number' ? colors : colors.length);

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
