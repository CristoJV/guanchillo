import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { deriveTemplate, parseTemplate } from '../dist/collection.js';
import { quantizeImage, reducePatternPalette } from '../dist/image-pattern.js';
import {
  chartRow, copyPattern, deserializePattern, hasStarted, jumpToStitch, makeColorGuide, newPattern, newProgress, newSphere,
  parsePattern, resizePattern, serializePattern, tileAt, totalSteps,
} from '../dist/model.js';
import { projectedStitch, projectedX, specialStitches, sphereLayout, stitchOperation } from '../dist/sphere.js';

const templates = new URL('../dist/patterns/', import.meta.url);
const readTemplate = key => JSON.parse(readFileSync(new URL(key + '.json', templates), 'utf8'));

test('the rounded spiral reproduces the 18-round counts and shaping offsets', () => {
  const { rounds } = sphereLayout(18);
  assert.deepEqual(rounds.map(round => round.stitches), [6, 12, 18, 24, 30, ...Array(8).fill(36), 30, 24, 18, 12, 6]);
  assert.deepEqual([3, 4, 5, 6, 14, 15, 16, 17, 18].map(number => rounds[number - 1].leading),
    [1, 1, 3, 2, 2, 3, 1, 1, 0]);
  for (const round of rounds.slice(1)) {
    const input = Array.from({ length: round.stitches }, (_, index) => stitchOperation(round, index + 1))
      .reduce((count, operation) => count + (operation === 'decrease' ? 2 : operation === 'increase-second' ? 0 : 1), 0);
    assert.equal(input, rounds[round.number - 2].stitches);
  }
});

test('the chart resolves each stitch through a centered gore and leaves gaps between gores', () => {
  const { rounds, goreWidth } = sphereLayout(21);
  assert.equal(projectedStitch(goreWidth, rounds[0], 1), null);
  assert.equal(projectedX(goreWidth, rounds[1], 0), 2.5);
  for (const round of rounds) {
    for (let stitch = 0; stitch < round.stitches; stitch++) {
      const center = projectedX(goreWidth, round, stitch) + 0.5;
      assert.equal(projectedStitch(goreWidth, round, center), stitch);
    }
    if (round.kind === 'plain') continue;
    const increase = round.kind === 'increase';
    for (const leftToRight of [true, false]) {
      for (const position of specialStitches(round, leftToRight)) {
        const point = leftToRight ? position + 1 : round.stitches - position - Number(increase);
        assert.equal(stitchOperation(round, point), increase ? 'increase-first' : 'decrease');
      }
    }
  }
});

test('the spiral visits every actual stitch without alternating or visiting projection gaps', () => {
  const pattern = newSphere(21);
  for (const direction of ['rtl', 'ltr']) {
    const progress = newProgress(pattern, { direction, alternate: true });
    assert.equal(progress.alternate, false);
    assert.equal(totalSteps(pattern, progress), 630);
    const path = Array.from({ length: 630 }, (_, offset) => tileAt(pattern, progress, offset));
    assert.equal(new Set(path.map(tile => tile.index)).size, 630);
    assert.equal(path[5].row, 1);
    assert.equal(path[6].row, 2);
    assert.equal(path[6].point, 1);
    assert.equal(path[6].leftToRight, path[5].leftToRight);
    assert.equal(path.at(-1).row, 21);
    assert.equal(tileAt(pattern, progress, 630), null);
  }
});

test('JSON preserves sphere colors and progress and still accepts a flat version 1 file', () => {
  const earth = parsePattern(readTemplate('earth'));
  const resized = resizePattern(earth, 27, earth.cols);
  assert.equal(resized.cols, 54);
  assert.equal(resized.cells.length, 1026);
  assert(resized.cells.every(value => value >= 0 && value < earth.palette.length));
  const { stitches } = chartRow(resized, resized.rows - 4);
  const progress = { ...newProgress(resized, { row: 4, col: stitches - 1 }), offset: 36 };
  const restored = deserializePattern(serializePattern(resized, progress));
  assert.equal(restored.pattern.shape, 'sphere');
  assert.deepEqual(restored.pattern.cells, resized.cells);
  assert.deepEqual(restored.progress, progress);
  assert.notEqual(restored.pattern.id, resized.id);
  assert.throws(() => deserializePattern(serializePattern({ ...earth, rows: 22 })), /sphere dimensions/);
  assert.throws(() => deserializePattern(serializePattern(earth, { ...newProgress(earth), alternate: true })), /saved progress/);

  const flat = newPattern(2, 3);
  const previousFile = deserializePattern(JSON.stringify(flat));
  assert.equal(previousFile.pattern.shape, undefined);
  assert.equal(previousFile.progress.alternate, true);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(offset => tileAt(flat, previousFile.progress, offset).index), [5, 4, 3, 0, 1, 2]);
});

test('the yarn countdown excludes the color-change stitch and continues across rows', () => {
  const pattern = newPattern(2, 4);
  pattern.cells = [1, 2, 3, 3, 1, 0, 0, 0];
  const progress = newProgress(pattern);
  const guide = makeColorGuide(pattern, progress);
  assert.deepEqual(Array.from({ length: 8 }, (_, offset) => guide(offset)), [
    { fullStitches: 2, nextColor: 1 },
    { fullStitches: 1, nextColor: 1 },
    { fullStitches: 0, nextColor: 1 },
    { fullStitches: 1, nextColor: 2 },
    { fullStitches: 0, nextColor: 2 },
    { fullStitches: 0, nextColor: 3 },
    { fullStitches: 2, nextColor: undefined },
    { fullStitches: 1, nextColor: undefined },
  ]);
  assert.equal(guide(8), null);
});

test('jumping to a stitch follows the current path and can move the start earlier', () => {
  const flat = newPattern(3, 3);
  const ready = newProgress(flat);
  assert.equal(jumpToStitch(flat, ready, { x: 2, y: 2 }), ready);

  const progress = newProgress(flat, { row: 3, col: 2 });
  const earlier = jumpToStitch(flat, progress, { x: 1, y: 1 });
  assert.equal(earlier.offset, 0);
  assert.equal(earlier.direction, 'ltr');
  assert.equal(earlier.started, true);
  assert.equal(tileAt(flat, earlier, 0).index, 4);
  assert.equal(tileAt(flat, earlier, 2).index, 2);

  const sphere = newSphere(21);
  const selected = jumpToStitch(sphere, newProgress(sphere), { x: 9, y: 19 });
  assert.equal(selected.offset, 8);
  const tile = tileAt(sphere, selected, selected.offset);
  assert.deepEqual([tile.row, tile.point, tile.x], [2, 3, 9]);
});

test('saved progress distinguishes Start from zero completed stitches and reads legacy records', () => {
  const pattern = newPattern(1, 3);
  const ready = newProgress(pattern);
  const active = { ...ready, started: true };
  assert.equal(hasStarted(ready), false);
  assert.deepEqual(deserializePattern(serializePattern(pattern, active)).progress, active);
  assert.equal(hasStarted(active), true);
  assert.equal(hasStarted({ ...ready, offset: 1 }), true);
  assert.throws(() => deserializePattern(serializePattern(pattern, { ...ready, started: 'yes' })), /saved progress/);
});

test('image quantization respects the color budget and keeps transparent stitches unassigned', () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0]);
  const automatic = quantizeImage(pixels, 2);
  assert.deepEqual(automatic.palette.map(({ hex }) => hex).sort(), ['#0000ff', '#ff0000']);
  assert.equal(automatic.cells[0], automatic.cells[1]);
  assert.notEqual(automatic.cells[0], automatic.cells[2]);
  assert.equal(automatic.cells[3], -1);
  const single = quantizeImage(pixels, 1);
  assert.equal(single.palette[0].hex, '#aa0055');
  assert.deepEqual(single.cells, [0, 0, 0, -1]);
  assert.deepEqual(quantizeImage(new Uint8ClampedArray([255, 4, 6, 1]), 4).cells, [-1]);
});

test('a supplied color palette preserves its exact colors and order', () => {
  const pixels = new Uint8ClampedArray([205, 10, 20, 255, 5, 30, 250, 255]);
  const chosen = ['#0000ff', '#ff0000', '#ffffff'];
  const pattern = quantizeImage(pixels, chosen);
  assert.deepEqual(pattern.palette.map(({ hex }) => hex), chosen);
  assert.deepEqual(pattern.cells, [1, 0]);
  assert.throws(() => quantizeImage(pixels, []), /between 1 and 8 colors/);
  assert.throws(() => quantizeImage(pixels, 9), /between 1 and 8 colors/);
});

test('the public template index contains valid spherical and flat pattern files', () => {
  const groups = readTemplate('index');
  assert.deepEqual(groups.space, ['earth', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  assert.equal(groups.holiday.length, 7);
  assert.equal(groups.pixel.length, 16);
  assert.equal(groups.originals.length, 6);
  const keys = Object.values(groups).flat();
  assert.deepEqual(readdirSync(templates).sort(), [...keys, 'index'].map(key => key + '.json').sort());
  for (const key of keys) {
    const template = parseTemplate(key, readTemplate(key));
    const { pattern, recommended } = template;
    assert.equal(pattern.id, 'guanchillo-template-' + key);
    assert(pattern.palette.length <= 8);
    if (pattern.shape === 'sphere') assert.deepEqual([pattern.rows, pattern.cols], [63, 126]);
    else assert.equal(Math.max(pattern.rows, pattern.cols), 64);
    const reduced = deriveTemplate(template, recommended, 4);
    assert.equal(reduced.rows, recommended.rows);
    assert.equal(reduced.cols, recommended.cols);
    assert(reduced.palette.length <= 4);
    assert.deepEqual(deserializePattern(serializePattern(reduced)).pattern.cells, reduced.cells);
    if (groups.space.includes(key)) assert.equal(pattern.shape, 'sphere');
    if (groups.pixel.includes(key)) assert.equal(pattern.shape, undefined);
  }
});

test('Earth derives color and resolution combinations from one unchanged master', () => {
  const file = readTemplate('earth');
  const earth = parseTemplate('earth', file);
  const recommended = deriveTemplate(earth, earth.recommended, 4);
  const larger = deriveTemplate(earth, earth.pattern, 4);
  const master = deriveTemplate(earth, earth.pattern, 8);
  assert.deepEqual([recommended.rows, larger.rows, master.rows], [24, 63, 63]);
  assert.deepEqual([recommended.palette.length, larger.palette.length, master.palette.length], [4, 4, 8]);
  assert.equal(new Set([recommended.id, larger.id, master.id]).size, 3);
  assert.deepEqual(master.cells, file.cells);
  assert.deepEqual(master.palette, file.palette);
  assert.deepEqual(earth.pattern.cells, file.cells);
  assert.throws(() => deriveTemplate(earth, { rows: 66, cols: 132 }, 4), /exceeds its master/);
});

test('resizing a template preserves the source and creates a separate pattern', () => {
  const original = parseTemplate('snowflake', readTemplate('snowflake'));
  const derived = deriveTemplate(original, { rows: 12, cols: 18 }, 3);
  const copy = copyPattern(derived, 'My snowflake');
  assert.notEqual(copy.id, derived.id);
  assert.equal(copy.cells.length, 216);
  assert.equal(copy.name, 'My snowflake');
  assert.deepEqual(copy.palette, derived.palette);
  copy.palette[0].name = 'Blue';
  assert.notEqual(copy.palette[0].name, derived.palette[0].name);
  assert.equal(original.pattern.cells.length, 4096);
});

test('the set uses smaller charts for the terrestrial planets and larger ones for the giants', () => {
  const approximateDiameterOrder = ['moon', 'mercury', 'mars', 'venus', 'earth', 'neptune', 'uranus', 'saturn', 'jupiter'];
  const rounds = approximateDiameterOrder.map(key => parseTemplate(key, readTemplate(key)).recommended.rows);
  assert.equal(rounds[0], 12);
  assert.equal(rounds.at(-1), 42);
  assert(rounds.every((count, index) => index === 0 || count > rounds[index - 1]));
});

test('palette reduction keeps named source yarns and unassigned stitches', () => {
  const pattern = newPattern(1, 5);
  pattern.palette = [
    { name: 'Navy', hex: '#246395' }, { name: 'Blue', hex: '#326b9e' }, { name: 'Pearl', hex: '#fff2de' },
  ];
  pattern.cells = [0, 0, 1, 2, -1];
  assert.deepEqual(reducePatternPalette(pattern, 2), {
    palette: [pattern.palette[0], pattern.palette[2]],
    cells: [0, 0, 0, 1, -1],
  });
});

test('existing files can still carry more than eight colors', () => {
  const pattern = newPattern(1, 1);
  assert.equal(pattern.palette.length, 4);
  for (let index = 0; index < 5; index++) pattern.palette.push({ name: 'Ochre ' + index, hex: '#b8874' + index });
  pattern.cells[0] = 8;
  const decoded = deserializePattern(serializePattern(pattern)).pattern;
  assert.deepEqual(decoded.palette, pattern.palette);
  assert.deepEqual(decoded.cells, [8]);
});
