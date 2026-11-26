import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crochetStep, stitchWindow } from '../dist/core/crochet.js';
import { actionFor, keyBinding, parseCrochetControls } from '../dist/core/crochet-controls.js';
import { makeColorGuide, newPattern, newProgress, newSphere } from '../dist/core/model.js';

function readStep(pattern, progress) {
  const step = crochetStep(pattern, progress, makeColorGuide(pattern, progress));
  return { step, window: stitchWindow(pattern, progress, step) };
}

test('the eight-stitch window slides in chart order and follows alternating rows', () => {
  const pattern = newPattern(2, 16);
  const progress = newProgress(pattern);
  const first = readStep(pattern, progress).window;
  assert.equal(first.first, 8);
  assert.deepEqual(first.cells.map(cell => cell.point), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(first.cells.at(-1).state, 'current');

  progress.offset = 5;
  const shifted = readStep(pattern, progress).window;
  assert.equal(shifted.first, 5);
  assert.deepEqual(shifted.cells.map(cell => cell.state), ['next', 'next', 'next', 'next', 'next', 'current', 'done', 'done']);

  progress.offset = 16;
  const nextRow = readStep(pattern, progress).window;
  assert.equal(nextRow.row, 2);
  assert.equal(nextRow.leftToRight, true);
  assert.equal(nextRow.first, 0);
  assert.equal(nextRow.cells[0].state, 'current');

  progress.offset = 21;
  assert.equal(readStep(pattern, progress).window.first, 3);
  progress.offset = 32;
  const complete = readStep(pattern, progress);
  assert.equal(complete.step.percent, 100);
  assert(complete.window.cells.every(cell => cell.state === 'done'));
});

test('the mobile window marks chart cells before a custom start and handles narrow rounds', () => {
  const pattern = newPattern(2, 4);
  const progress = newProgress(pattern, { row: 2, col: 3, direction: 'rtl' });
  const { window } = readStep(pattern, progress);
  assert.deepEqual(window.cells.map(cell => cell.state), ['next', 'next', 'current', 'outside']);

  const sphere = newSphere(6);
  const rounds = newProgress(sphere);
  const first = readStep(sphere, rounds);
  assert.equal(first.window.cells.length, 6);
  assert.match(first.step.operation, /magic ring/);
  rounds.offset = 6;
  const second = readStep(sphere, rounds);
  assert.equal(second.window.row, 2);
  assert.equal(second.window.cells.length, 8);
  assert.match(second.step.operation, /Increase/);
  rounds.offset = sphere.cells.length - 1;
  assert.match(readStep(sphere, rounds).step.roundNote, /Stuff/);
  rounds.offset++;
  assert.match(readStep(sphere, rounds).step.roundNote, /Fasten off/);
});

test('the instruction exposes the next color and the single stitch that closes with it', () => {
  const pattern = newPattern(1, 4);
  pattern.cells = [1, 0, 0, 0];
  const progress = newProgress(pattern);
  const first = readStep(pattern, progress).step;
  assert.equal(first.started, false);
  assert.equal(first.color.name, pattern.palette[0].name);
  assert.equal(first.cue.fullStitches, 2);
  assert.equal(first.nextColor, pattern.palette[1].name);
  progress.offset = 2;
  assert.equal(readStep(pattern, progress).step.cue.fullStitches, 0);
  progress.offset = 3;
  assert.equal(readStep(pattern, progress).step.nextColor, undefined);
});

test('custom controls take priority, retain other defaults and recover from malformed settings', () => {
  const advance = { kind: 'key', code: 'KeyK', label: 'k' };
  const back = { kind: 'mouse', button: 0 };
  const controls = parseCrochetControls({ advance, back });
  assert.equal(actionFor(controls, { ...advance, label: 'K' }), 'advance');
  assert.equal(actionFor(controls, back), 'back');
  assert.equal(actionFor(controls, { kind: 'key', code: 'ArrowLeft', label: 'ArrowLeft' }), 'back');
  assert.equal(actionFor(controls, { kind: 'key', code: 'Space', label: 'Space' }), 'advance');
  assert.deepEqual(parseCrochetControls({ advance, back: advance }), { advance });
  assert.deepEqual(parseCrochetControls({ advance: { kind: 'mouse', button: 8 }, back: { ...advance, code: 'Tab' } }), {});
  assert.equal(keyBinding({ key: 'Tab', code: 'Tab' }), undefined);
  assert.equal(keyBinding({ key: 'k', code: 'KeyK', metaKey: true }), undefined);
  assert.deepEqual(keyBinding({ key: ' ', code: 'Space' }), { kind: 'key', code: 'Space', label: 'Space' });
});
