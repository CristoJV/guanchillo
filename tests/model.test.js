import assert from 'node:assert/strict';
import { test } from 'node:test';
import { earthPattern } from '../dist/earth.js';
import {
  chartRow, deserializePattern, hasStarted, jumpToStitch, makeColorGuide, newPattern, newProgress, newSphere,
  resizePattern, serializePattern, tileAt, totalSteps,
} from '../dist/model.js';
import { projectedStitch, projectedX, specialStitches, sphereLayout, stitchOperation } from '../dist/sphere.js';

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
  const earth = earthPattern();
  const resized = resizePattern(earth, 24, earth.cols);
  assert.equal(resized.cols, 48);
  assert.equal(resized.cells.length, 816);
  assert(resized.cells.every(value => value >= 0 && value < 3));
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
