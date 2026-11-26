import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium, devices } from 'playwright';
import { newPattern, newProgress, newSphere, serializePattern } from '../dist/core/model.js';

const dist = new URL('../dist/', import.meta.url);
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const path = request.url.slice('/guanchillo/'.length) || 'index.html';
  if (!request.url.startsWith('/guanchillo/') || !/^[a-z\d/.-]+$/.test(path) || path.includes('..')) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL(path, dist));
    response.writeHead(200, { 'Content-Type': types[path.split('.').at(-1)] }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});

let browser, url;
before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/guanchillo/`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server.close();
});

async function openPage(t, options = {}, init) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(3500);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
  });
  if (init) await page.addInitScript(init);
  await page.goto(url);
  return page;
}

async function importPattern(page, pattern, progress) {
  await page.locator('#file-input').setInputFiles({
    name: 'test.guanchillo.json', mimeType: 'application/json', buffer: Buffer.from(serializePattern(pattern, progress)),
  });
  await page.waitForFunction(name => document.querySelector('#board-title').textContent === name, pattern.name);
}

async function value(page) {
  return page.locator('#mobile-progress').evaluate(element => element.value);
}

async function visibleText(page, id) {
  const element = page.locator('#' + id);
  await element.waitFor({ state: 'visible' });
  return element.innerText();
}

const phone = { ...devices['iPhone SE'], viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' };

test('mobile follows the sliding stitch window, warns before changing yarn and shares a saved v1 route with desktop', async t => {
  const page = await openPage(t, phone);
  const pattern = newPattern(2, 12, 'Mobile color cue');
  pattern.palette = [{ name: 'Pink', hex: '#dd88aa' }, { name: 'Green', hex: '#44aa77' }];
  pattern.cells.fill(1);
  pattern.cells.fill(0, 16);
  await importPattern(page, pattern);
  await page.locator('#work-mode').tap();
  assert.equal(await page.locator('#workspace').isVisible(), false);
  assert.equal(await visibleText(page, 'mobile-instruction'), 'Crochet 7 stitches in Pink.');
  assert.equal(await visibleText(page, 'mobile-color-warning'), 'Then close the next stitch with Green.');
  const ordered = await page.locator('.site-header, .mobile-progress, .mobile-pattern, .mobile-instructions')
    .evaluateAll(elements => elements.map(element => element.getBoundingClientRect()));
  assert(ordered.every((rect, index) => !index || rect.top >= ordered[index - 1].bottom));
  assert(ordered.at(-1).bottom <= 568);
  assert.equal(await page.locator('.mobile-stitch').count(), 8);
  const firstCell = page.locator('.mobile-stitch').first();
  assert.match(await firstCell.getAttribute('aria-label'), /Stitch 8,/);

  await page.locator('#mobile-stitches').tap();
  assert.equal(await value(page), 0);
  assert.equal(await visibleText(page, 'mobile-next'), 'Next');

  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  assert.equal(await value(page), 7);
  assert.equal(await visibleText(page, 'mobile-instruction'), 'Crochet 1 stitch in Pink.');
  assert.equal(await visibleText(page, 'mobile-color-warning'), 'Close this stitch with Green.');
  assert.match(await firstCell.getAttribute('aria-label'), /Stitch 12,/);

  await page.keyboard.press('ArrowRight');
  assert.equal(await value(page), 8);
  assert.equal(await page.locator('#mobile-color-warning').isVisible(), false);
  await page.reload();
  assert.equal(await visibleText(page, 'mobile-count'), '8 / 24');

  await page.setViewportSize({ width: 1200, height: 800 });
  assert.equal(await visibleText(page, 'done-count'), '8 of 24 stitches');
  assert.equal(await page.locator('#mobile-crochet').isVisible(), false);
  await page.keyboard.press('ArrowRight');
  assert.equal(await visibleText(page, 'done-count'), '9 of 24 stitches');

  await page.locator('#edit-mode').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('#export-pattern').click();
  const download = await downloaded;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.version, 1);
  assert.equal(exported.progress.offset, 9);
  assert.deepEqual(exported.cells, pattern.cells);

  await page.setViewportSize(phone.viewport);
  await page.locator('#file-input').setInputFiles(await download.path());
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('guanchillo:v1:preferences')).activeId !== id, exported.id);
  await page.locator('#work-mode').tap();
  assert.equal(await visibleText(page, 'mobile-count'), '9 / 24');
});

test('pedal settings capture keyboard and mouse, isolate controls, and persist across reload', async t => {
  const page = await openPage(t, phone);
  await page.locator('#work-mode').tap();
  await page.locator('#mobile-settings').tap();
  await page.locator('#start-row').fill('2');
  await page.locator('#start-col').fill('10');
  await page.locator('#start-direction').selectOption('ltr');
  await page.getByRole('button', { name: 'Apply starting point' }).tap();
  assert.equal(await visibleText(page, 'mobile-position'), 'Row 2 · Stitch 10');
  assert.equal(await visibleText(page, 'mobile-direction'), '→');

  await page.locator('#mobile-settings').tap();
  await page.locator('#assign-advance').tap();
  await page.keyboard.press('k');
  assert.equal(await visibleText(page, 'binding-advance'), 'k');
  await page.locator('#assign-back').tap();
  await page.keyboard.press('k');
  assert.match(await visibleText(page, 'capture-error'), /already assigned/);
  await page.locator('#capture-help').click({ button: 'right' });
  assert.equal(await visibleText(page, 'binding-back'), 'Right mouse button');
  assert.equal(await value(page), 0);
  await page.keyboard.press('Escape');

  await page.keyboard.down('k');
  await page.keyboard.down('k');
  await page.keyboard.up('k');
  assert.equal(await value(page), 0);
  assert.equal(await visibleText(page, 'mobile-next'), 'Next');
  await page.keyboard.press('k');
  assert.equal(await value(page), 1);
  await page.locator('#mobile-instruction').click({ button: 'right' });
  assert.equal(await value(page), 0);

  await page.mouse.move(30, 535);
  await page.mouse.down();
  await page.mouse.move(100, 535);
  await page.mouse.move(30, 535);
  await page.mouse.up();
  assert.equal(await value(page), 0);
  await page.mouse.click(30, 535);
  assert.equal(await value(page), 1);

  await page.locator('.brand-mark').click({ button: 'right' });
  assert.equal(await value(page), 1);
  await page.locator('#mobile-settings').tap();
  await page.keyboard.press('k');
  assert.equal(await value(page), 1);
  await page.keyboard.press('Escape');
  assert.equal(await value(page), 1);

  await page.reload();
  assert.equal(await visibleText(page, 'mobile-count').then(text => text.split(' / ')[0]), '1');
  await page.keyboard.press('k');
  assert.equal(await value(page), 2);
  await page.locator('#mobile-previous').tap();
  assert.equal(await value(page), 1);
  await page.locator('#mobile-settings').tap();
  await page.locator('#clear-back').tap();
  assert.equal(await visibleText(page, 'binding-back'), '←');
  await page.keyboard.press('Escape');
  await page.locator('#mobile-instruction').click({ button: 'right' });
  assert.equal(await value(page), 1);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await value(page), 0);
});

test('the mobile sphere shows shaping, stuffing and finishing in the instruction panel', async t => {
  const page = await openPage(t, phone);
  const pattern = newSphere(6, 'Mobile sphere');
  const progress = newProgress(pattern);
  progress.offset = pattern.cells.length - 1;
  await importPattern(page, pattern, progress);
  await page.locator('#work-mode').tap();
  assert.match(await visibleText(page, 'mobile-round-note'), /Stuff the sphere/);
  assert.match(await visibleText(page, 'mobile-operation'), /Decrease/);
  await page.locator('#mobile-next').tap();
  assert.equal(await visibleText(page, 'mobile-percent'), '100%');
  assert.equal(await visibleText(page, 'mobile-instruction'), 'Pattern complete.');
  assert.match(await visibleText(page, 'mobile-round-note'), /Fasten off/);
  assert(await page.locator('#mobile-next').isDisabled());
});

test('the editor supports touch, undo, sizing and image controls on a narrow screen', async t => {
  const page = await openPage(t, phone);
  const pattern = newPattern(2, 3, 'Touch editor');
  await importPattern(page, pattern);
  const viewport = page.locator('#grid-surface');
  await viewport.tap({ position: { x: 10, y: 10 } });
  assert.equal(await visibleText(page, 'empty-count'), '5');
  await page.locator('#undo-action').tap();
  assert.equal(await visibleText(page, 'empty-count'), '6');
  await page.locator('#redo-action').tap();
  assert.equal(await visibleText(page, 'empty-count'), '5');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.equal(scrollWidth, 320);

  assert.equal(await page.locator('#rows').isVisible(), false);
  await page.getByText('Grid and reference', { exact: true }).tap();
  await page.locator('#rows').fill('3');
  await page.getByRole('button', { name: 'Apply size' }).tap();
  assert.match(await visibleText(page, 'board-meta'), /3 rows × 3 columns/);

  await page.getByText('Pattern details', { exact: true }).tap();
  assert(await page.locator('#export-pattern').isVisible());
  await page.locator('#image-open').tap();
  assert(await page.locator('#image-dialog').isVisible());
  assert.equal(await page.locator('#image-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
});

test('Catalog migrates the saved view and shows seven Minecraft cards in one mobile column', async t => {
  const page = await openPage(t, phone, () => {
    if (!localStorage.getItem('guanchillo:v1:preferences')) {
      localStorage.setItem('ganchillo:v1:preferences', JSON.stringify({ activeId: 'old-id', mode: 'collection' }));
    }
  });
  assert.equal(await visibleText(page, 'mode-title'), 'Pattern catalog');
  const filter = page.locator('#catalog-tag');
  await filter.selectOption('minecraft');
  assert.equal(await visibleText(page, 'catalog-status'), '7 patterns');
  const cards = page.locator('.template-card:visible');
  assert.equal(await cards.count(), 7);
  const rects = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect()));
  assert(rects.every((rect, index) => rect.left === rects[0].left && (!index || rect.top >= rects[index - 1].bottom)));
  const alex = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Alex', exact: true }) });
  assert.equal(await alex.locator('[data-template-colors]').inputValue(), '5');
  await alex.getByRole('button', { name: 'Crochet Alex' }).tap();
  assert.equal(await visibleText(page, 'mobile-pattern-name'), 'Alex');
  assert.equal(await page.locator('.mobile-stitch').count(), 8);
});

test('desktop keeps chart jumps, keyboard navigation and clicks outside the chart', async t => {
  const page = await openPage(t, { viewport: { width: 1280, height: 800 } });
  const pattern = newPattern(2, 6, 'Desktop chart');
  await importPattern(page, pattern);
  await page.locator('#work-mode').click();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  assert.equal(await visibleText(page, 'done-count'), '1 of 12 stitches');
  const box = await page.locator('#grid-surface').boundingBox();
  await page.mouse.click(box.x + box.width / 12, box.y + box.height * 0.75);
  assert.equal(await visibleText(page, 'current-point'), '6');
  assert.equal(await visibleText(page, 'done-count'), '5 of 12 stitches');
  await page.locator('#zoom-in').click();
  assert.equal(await visibleText(page, 'done-count'), '5 of 12 stitches');
  await page.mouse.click(5, 770);
  assert.equal(await visibleText(page, 'done-count'), '6 of 12 stitches');
  assert.equal(await visibleText(page, 'current-row'), '2');
  await page.locator('#progress-settings').click();
  await page.locator('#assign-advance').click();
  await page.locator('#capture-help').click({ button: 'middle' });
  assert.equal(await visibleText(page, 'binding-advance'), 'Middle mouse button');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 770, { button: 'middle' });
  assert.equal(await visibleText(page, 'done-count'), '7 of 12 stitches');
  await page.locator('#next-stitch').click();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await visibleText(page, 'done-count'), '7 of 12 stitches');
});

test('Go to stitch corrects mobile progress without resetting the existing route', async t => {
  const page = await openPage(t, phone);
  const pattern = newPattern(3, 10, 'Correction path');
  const progress = { ...newProgress(pattern, { row: 2, col: 6 }), offset: 2 };
  await importPattern(page, pattern, progress);
  await page.locator('#work-mode').tap();
  await page.locator('#mobile-settings').tap();
  await page.locator('#seek-section summary').tap();
  assert.equal(await page.locator('#seek-row').getAttribute('min'), '2');
  assert.equal(await page.locator('#seek-point').getAttribute('min'), '5');
  assert.equal(await page.locator('#seek-point').inputValue(), '7');
  await page.locator('#seek-point').fill('4');
  await page.getByRole('button', { name: 'Go to stitch' }).tap();
  assert(await page.locator('#progress-dialog').isVisible());

  await page.locator('#seek-row').fill('3');
  await page.locator('#seek-point').fill('4');
  await page.getByRole('button', { name: 'Go to stitch' }).tap();
  assert.equal(await visibleText(page, 'mobile-position'), 'Row 3 · Stitch 4');
  assert.equal(await value(page), 9);
  await page.reload();
  assert.equal(await visibleText(page, 'mobile-count'), '9 / 16');

  await page.locator('#library-open').tap();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Correction path' }).tap();
  const saved = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  assert.deepEqual(saved.progress, { ...progress, offset: 9, started: true });

  await importPattern(page, newSphere(6, 'Correction round'));
  await page.locator('#mobile-settings').tap();
  await page.locator('#seek-section summary').tap();
  assert.equal(await visibleText(page, 'seek-row-label'), 'Round');
  await page.locator('#seek-row').fill('2');
  assert.equal(await page.locator('#seek-point').getAttribute('max'), '12');
  await page.locator('#seek-point').fill('1');
  await page.getByRole('button', { name: 'Go to stitch' }).tap();
  assert.equal(await visibleText(page, 'mobile-position'), 'Round 2 · Stitch 1');
  assert.equal(await value(page), 6);
});

test('the screen preference requests a lock only for visible crochet with pending stitches', async t => {
  const page = await openPage(t, phone, () => {
    window.wakeLog = [];
    let visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => visibility });
    window.changeVisibility = (state) => {
      visibility = state;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    class Sentinel extends EventTarget {
      released = false;
      async release() {
        this.released = true;
        window.wakeLog.push('release');
        this.dispatchEvent(new Event('release'));
      }
    }
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        async request(type) {
          window.wakeLog.push(type);
          if (window.denyWake) throw new DOMException('Unavailable', 'NotAllowedError');
          return new Sentinel();
        },
      },
    });
  });
  const pattern = newPattern(1, 1, 'Screen setting');
  await importPattern(page, pattern);
  await page.locator('#work-mode').tap();
  await page.locator('#mobile-settings').tap();
  await page.locator('#keep-screen-awake').check();
  assert.equal(await visibleText(page, 'screen-wake-status'), 'Screen is staying awake.');
  await page.evaluate(() => window.changeVisibility('hidden'));
  await page.evaluate(() => window.changeVisibility('visible'));
  assert.equal(await visibleText(page, 'screen-wake-status'), 'Screen is staying awake.');
  await page.locator('#progress-close').tap();
  await page.locator('#edit-mode').tap();
  assert.deepEqual(await page.evaluate(() => window.wakeLog), ['screen', 'release', 'screen', 'release']);

  await page.evaluate(() => { window.denyWake = true; });
  await page.locator('#work-mode').tap();
  await page.locator('#mobile-settings').tap();
  assert(await page.locator('#keep-screen-awake').isChecked());
  assert.equal(await visibleText(page, 'screen-wake-status'), 'This device could not keep the screen awake.');
  await page.evaluate(() => { window.denyWake = false; });
  await page.locator('#keep-screen-awake').uncheck();
  await page.locator('#keep-screen-awake').check();
  assert.equal(await visibleText(page, 'screen-wake-status'), 'Screen is staying awake.');
  await page.locator('#progress-close').tap();
  await page.locator('#mobile-next').tap();
  await page.locator('#mobile-next').tap();
  assert.equal(await visibleText(page, 'mobile-percent'), '100%');
  assert.equal(await page.evaluate(() => window.wakeLog.at(-1)), 'release');
  await page.reload();
  await page.locator('#mobile-settings').tap();
  assert(await page.locator('#keep-screen-awake').isChecked());
  assert.deepEqual(await page.evaluate(() => window.wakeLog), []);
});

test('the library searches projects and exports or resumes one while another is active', async t => {
  const page = await openPage(t, phone);
  const saved = newPattern(2, 4, 'Patrón de Ágata');
  const route = { ...newProgress(saved), offset: 5 };
  await importPattern(page, saved, route);
  await importPattern(page, newPattern(2, 2, 'Other project'));
  await page.locator('#library-open').tap();
  await page.locator('#library-search').fill('AGATA patron');
  assert.equal(await visibleText(page, 'library-status'), '1 pattern');
  assert.match(await page.locator('.library-progress').textContent(), /5 of 8 stitches/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Patrón de Ágata' }).tap();
  const data = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  assert.equal(data.name, saved.name);
  assert.deepEqual(data.progress, route);
  assert.equal(await page.locator('#board-title').textContent(), 'Other project');
  await page.getByRole('button', { name: 'Resume Patrón de Ágata' }).tap();
  assert.equal(await visibleText(page, 'mobile-count'), '5 / 8');
  await page.locator('#library-open').tap();
  await page.getByRole('button', { name: 'Edit Other project' }).tap();
  assert.equal(await visibleText(page, 'board-title'), 'Other project');
});

test('catalog combines name, theme and type and defers drawing off-screen previews', async t => {
  const page = await openPage(t, phone);
  await page.locator('#catalog-mode').tap();
  const list = page.locator('.template-card');
  await list.first().waitFor();
  const zombie = list.filter({ has: page.getByRole('heading', { name: 'Zombie', exact: true }) });
  assert.equal(await zombie.locator('canvas').getAttribute('aria-hidden'), 'true');
  await zombie.scrollIntoViewIfNeeded();
  await zombie.locator('canvas:not([aria-hidden])').waitFor();
  assert.equal(await zombie.locator('canvas').evaluate(canvas => canvas.width), 8);
  const search = page.locator('#catalog-search');
  await search.fill('zarza ESPIRÁL');
  await page.locator('#catalog-tag').selectOption('canarias');
  await page.locator('#catalog-shape').selectOption('flat');
  assert.equal(await visibleText(page, 'catalog-status'), '1 pattern');
  assert.match(await page.locator('.template-card:visible h2').textContent(), /Espiral de La Zarza/);
  await page.locator('#catalog-shape').selectOption('sphere');
  assert.equal(await visibleText(page, 'catalog-status'), 'No patterns match these filters.');
  await page.locator('#catalog-reset').tap();
  assert.equal(await visibleText(page, 'catalog-status'), '34 patterns');
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);

  const jupiter = list.filter({ has: page.getByRole('heading', { name: 'Jupiter', exact: true }) });
  assert.equal(await jupiter.locator('canvas').getAttribute('aria-hidden'), 'true');
  await jupiter.locator('[data-template-resolution]').selectOption('high');
  await jupiter.locator('[data-template-colors]').selectOption('5');
  await jupiter.getByRole('button', { name: 'Edit Jupiter' }).evaluate(button => button.focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  assert.equal(await visibleText(page, 'board-title'), 'Jupiter');
  assert.match(await visibleText(page, 'board-meta'), /63 rounds/);
  assert.equal(await page.locator('.color-choice').count(), 5);
});

test('touch cancellation and Escape discard temporary editor strokes and preserve undo', async t => {
  const page = await openPage(t, phone);
  await importPattern(page, newPattern(2, 2, 'Cancel drawing'));
  const surface = page.locator('#grid-surface');
  const colors = page.locator('#grid-colors');
  const firstPixel = () => colors.evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data));
  const blank = await firstPixel();
  const point = { x: 9, y: 9 };
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  const x = box.x + point.x;
  const y = box.y + point.y;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  assert.notDeepEqual(await firstPixel(), blank);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.deepEqual(await firstPixel(), blank);
  assert(await page.locator('#undo-action').isDisabled());
  await surface.tap({ position: point });
  assert.equal(await visibleText(page, 'empty-count'), '3');

  const secondPixel = () => colors.evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(1, 0, 1, 1).data));
  const beforeEscape = await secondPixel();
  await page.mouse.move(x + box.width / 2, y);
  await page.mouse.down();
  assert.notDeepEqual(await secondPixel(), beforeEscape);
  await page.keyboard.press('Escape');
  assert.deepEqual(await secondPixel(), beforeEscape);
  await page.mouse.up();
  assert.equal(await visibleText(page, 'empty-count'), '3');
  await page.locator('#undo-action').tap();
  assert.equal(await visibleText(page, 'empty-count'), '4');
  await page.locator('#redo-action').tap();
  assert.equal(await visibleText(page, 'empty-count'), '3');
});

test('Escape restores a reference image after an intercepted drag', async t => {
  const page = await openPage(t, { viewport: { width: 1200, height: 800 } });
  await page.locator('#image-open').click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    canvas.getContext('2d').fillRect(0, 0, 4, 4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const tinyPng = Buffer.from(png, 'base64');
  await page.locator('#image-file').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: tinyPng });
  await page.locator('#image-use-reference').click();
  await page.locator('#reference-move').click();
  const image = page.locator('#grid-reference-image');
  const left = () => image.evaluate(element => element.style.left);
  const initialLeft = await left();
  const grid = await page.locator('#grid-surface').boundingBox();
  await page.mouse.move(grid.x + 20, grid.y + 20);
  await page.mouse.down();
  await page.mouse.move(grid.x + 50, grid.y + 20);
  assert.notEqual(await left(), initialLeft);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal(await left(), initialLeft);
});
