import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crochetStep, stitchWindow } from '../dist/core/crochet.js';
import { actionFor, keyBinding, parseCrochetControls } from '../dist/core/crochet-controls.js';
import { matchPatternName } from '../dist/core/search.js';
import { newPattern, newProgress, newSphere, seekStitch, tileAt } from '../dist/core/model.js';

function readStep(pattern, progress) {
  const step = crochetStep(pattern, progress);
  return { step, window: stitchWindow(pattern, progress, step) };
}

test('the eight-stitch window slides in chart order and follows alternating rows', () => {
  const pattern = newPattern(2, 16);
  const progress = newProgress(pattern);
  const first = readStep(pattern, progress).window;
  assert.equal(first.first, 8);
  assert.deepEqual(first.rows[1].cells.map(cell => cell.point), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(first.rows[1].cells.at(-1).state, 'current');

  progress.offset = 5;
  const shifted = readStep(pattern, progress).window;
  assert.equal(shifted.first, 5);
  assert.deepEqual(shifted.rows[1].cells.map(cell => cell.state), ['next', 'next', 'next', 'next', 'next', 'current', 'done', 'done']);

  progress.offset = 16;
  const nextRow = readStep(pattern, progress).window;
  assert.equal(nextRow.row, 2);
  assert.equal(nextRow.leftToRight, true);
  assert.equal(nextRow.first, 0);
  assert.equal(nextRow.rows[1].cells[0].state, 'current');

  progress.offset = 21;
  assert.equal(readStep(pattern, progress).window.first, 3);
  progress.offset = 32;
  const complete = readStep(pattern, progress);
  assert.equal(complete.step.percent, 100);
  assert(complete.window.rows[1].cells.every(cell => cell.state === 'done'));
});

test('the mobile window marks chart cells before a custom start and handles narrow rounds', () => {
  const pattern = newPattern(2, 4);
  const progress = newProgress(pattern, { row: 2, col: 3, direction: 'rtl' });
  const { window } = readStep(pattern, progress);
  assert.deepEqual(window.rows[1].cells.map(cell => cell.state), ['next', 'next', 'current', 'outside']);

  const sphere = newSphere(6);
  const rounds = newProgress(sphere);
  const first = readStep(sphere, rounds);
  assert.equal(first.window.rows[1].cells.length, 6);
  assert.match(first.step.operation, /magic ring/);
  rounds.offset = 6;
  const second = readStep(sphere, rounds);
  assert.equal(second.window.row, 2);
  assert.equal(second.window.rows[1].cells.length, 8);
  assert.match(second.step.operation, /Increase/);
  rounds.offset = sphere.cells.length - 1;
  assert.match(readStep(sphere, rounds).step.roundNote, /Stuff/);
  rounds.offset++;
  assert.match(readStep(sphere, rounds).step.roundNote, /Fasten off/);
});

test('the chart shows the next and previous rows while keeping flat columns aligned', () => {
  const pattern = newPattern(3, 16);
  const progress = newProgress(pattern);
  progress.offset = 16 + 7;
  const { window } = readStep(pattern, progress);
  assert.deepEqual(window.rows.map(row => row.number), [3, 2, 1]);
  assert.deepEqual(window.rows[0].cells.map(cell => cell.point), [11, 10, 9, 8, 7, 6, 5, 4]);
  assert.deepEqual(window.rows[1].cells.map(cell => cell.point), [6, 7, 8, 9, 10, 11, 12, 13]);
  assert(window.rows[2].cells.every(cell => cell.state === 'done' && cell.operation.symbol === 'X'));
});

test('the chart uses X for the magic ring, V for increases and Λ for decreases', () => {
  const sphere = newSphere(6);
  const progress = newProgress(sphere);
  progress.offset = 6;
  const second = readStep(sphere, progress).window;
  assert.deepEqual(second.rows.map(row => row.number), [3, 2, 1]);
  assert(second.rows[1].cells.every(cell => cell.operation.symbol === 'V'));
  assert(second.rows[2].cells.every(cell => cell.operation.symbol === 'X'));
  progress.offset = sphere.cells.length - 1;
  const last = readStep(sphere, progress).window;
  assert.equal(last.rows[0], null);
  assert(last.rows[1].cells.every(cell => cell.operation.symbol === 'Λ'));
});

test('yarn guidance stays within the current row and highlights only an actual closing stitch', () => {
  const pattern = newPattern(3, 20);
  pattern.palette[0].name = 'Linen';
  pattern.palette[1].name = 'Bark';
  pattern.cells.fill(0);
  const progress = newProgress(pattern);
  progress.offset = 14;
  assert.equal(crochetStep(pattern, progress).instruction, 'Crochet 6 stitches in Linen (to end the row).');

  pattern.cells[20] = 1;
  const before = crochetStep(pattern, progress);
  assert.equal(before.instruction, 'Crochet 5 stitches in Linen.');
  assert.equal(before.changingColor, false);
  progress.offset = 19;
  const change = crochetStep(pattern, progress);
  assert.equal(change.instruction, 'Crochet this stitch in Linen but close it with Bark.');
  assert.equal(change.changingColor, true);
  progress.offset = 20;
  assert.equal(crochetStep(pattern, progress).instruction, 'Crochet this stitch in Bark but close it with Linen.');
  progress.offset = 21;
  assert.equal(crochetStep(pattern, progress).instruction, 'Crochet 19 stitches in Linen (to end the row).');
  progress.offset = 60;
  assert.equal(crochetStep(pattern, progress).instruction, 'Pattern complete.');
});

test('sphere guidance respects both the round boundary and changes in stitch operation', () => {
  const sphere = newSphere(6);
  sphere.cells.fill(0);
  const progress = newProgress(sphere);
  progress.offset = 4;
  assert.equal(crochetStep(sphere, progress).instruction, 'Crochet 2 stitches in Natural cream (to end the round).');
  progress.offset = 6;
  const increase = crochetStep(sphere, progress);
  assert.equal(increase.instruction, 'Crochet 1 stitch in Natural cream.');
  assert.match(increase.operation, /first stitch/);
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

test('seeking a stitch keeps the starting coordinates and direction of the current path', () => {
  const pattern = newPattern(4, 10);
  const progress = { ...newProgress(pattern, { row: 2, col: 6 }), offset: 7 };
  assert.equal(seekStitch(pattern, progress, 1, 5), null);
  assert.equal(seekStitch(pattern, progress, 2, 4), null);
  assert.equal(seekStitch(pattern, progress, 3, 0), null);
  assert.equal(seekStitch(pattern, progress, 3, 2), progress);
  assert.deepEqual(seekStitch(pattern, progress, 2, 5), { ...progress, offset: 0, started: true });
  const moved = seekStitch(pattern, progress, 4, 7);
  assert.deepEqual(moved, { ...progress, offset: 22, started: true });
  assert.deepEqual(tileAt(pattern, moved, moved.offset), tileAt(pattern, progress, 22));

  const leftToRight = newProgress(pattern, { row: 2, col: 6, direction: 'ltr' });
  assert.equal(seekStitch(pattern, leftToRight, 2, 5), null);
  assert.equal(seekStitch(pattern, leftToRight, 2, 8).offset, 2);
});

test('seeking a round validates its actual stitch count', () => {
  const sphere = newSphere(6);
  const progress = newProgress(sphere);
  assert.equal(seekStitch(sphere, progress, 1, 7), null);
  assert.equal(seekStitch(sphere, progress, 2, 1).offset, 6);
  assert.equal(seekStitch(sphere, progress, 2, 12).offset, 17);
});

test('search matches multiple words with differences in case, order and accents', () => {
  assert(matchPatternName('  zarza ESPIRÁL  ')('Espiral de La Zarza'));
  assert(!matchPatternName('zarza timple')('Espiral de La Zarza'));
  assert(matchPatternName('ñANDÚ')('Nandu'));
  assert(matchPatternName('  ')('Anything'));
});
