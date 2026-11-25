import { byId } from './dom.js';
import { makeGlobe } from './globe.js';
import { reducePatternPalette } from './image-pattern.js';
import { limits, parsePattern, resamplePattern, type Dimensions, type Pattern } from './model.js';
import { drawFlatPreview } from './preview.js';
import { isSphereSize } from './sphere.js';

const categories = ['space', 'holiday', 'pixel', 'originals'] as const;
type Category = (typeof categories)[number];
type Action = 'edit' | 'work';

export interface PatternTemplate {
  key: string;
  category: Category;
  pattern: Pattern;
  recommended: Dimensions;
}

let pending: Promise<PatternTemplate[]> | undefined;

export function parseTemplate(key: string, file: unknown): Pick<PatternTemplate, 'pattern' | 'recommended'> {
  const { id, ...master } = parsePattern(file);
  if (id !== 'guanchillo-template-' + key || master.palette.length > limits.colors) {
    throw new Error('Invalid template identity or palette.');
  }
  const size = typeof file === 'object' && file && 'recommended' in file ? file.recommended : null;
  if (typeof size !== 'object' || !size || !('rows' in size) || !('cols' in size) ||
    typeof size.rows !== 'number' || typeof size.cols !== 'number' ||
    !Number.isInteger(size.rows) || !Number.isInteger(size.cols) ||
    size.rows < 1 || size.rows > master.rows || size.cols < 1 || size.cols > master.cols ||
    (master.shape === 'sphere' && (!isSphereSize(size.rows) || size.cols !== size.rows * 2))) {
    throw new Error('Invalid recommended template size.');
  }
  return { pattern: { ...master, id }, recommended: { rows: size.rows, cols: size.cols } };
}

export function deriveTemplate(template: Pick<PatternTemplate, 'pattern'>, size: Dimensions, colors: number): Pattern {
  if (!Number.isInteger(size.rows) || size.rows < 1 || !Number.isInteger(size.cols) || size.cols < 1 ||
    (template.pattern.shape === 'sphere' && size.cols !== size.rows * 2)) {
    throw new Error('Invalid template dimensions.');
  }
  if (size.rows > template.pattern.rows || size.cols > template.pattern.cols) {
    throw new Error('Template size exceeds its master chart.');
  }
  const resized = resamplePattern(template.pattern, size.rows, size.cols);
  return {
    ...resized, ...reducePatternPalette(resized, colors),
    id: resized.id + '-' + resized.rows + 'x' + resized.cols + '-' + colors + '-colors',
  };
}

export function setColorChoices(select: HTMLSelectElement, template?: PatternTemplate) {
  const max = template?.pattern.palette.length ?? 0;
  const options = Array.from({ length: max }, (_, index) => {
    const count = index + 1;
    return new Option(count + (count === 1 ? ' color' : ' colors'), String(count));
  });
  select.replaceChildren(...options);
  if (max) select.value = String(Math.min(limits.defaultColors, max));
}

async function loadTemplates(): Promise<PatternTemplate[]> {
  const directory = new URL('patterns/', document.baseURI);
  async function read(name: string): Promise<unknown> {
    const response = await fetch(new URL(name + '.json', directory));
    if (!response.ok) throw new Error('Could not load the template collection.');
    return response.json();
  }

  const manifest = await read('index');
  if (typeof manifest !== 'object' || !manifest) throw new Error('Invalid template index.');
  const index = manifest as Record<string, unknown>;
  const templates: { key: string; category: Category }[] = [];
  const keys = new Set<string>();
  for (const category of categories) {
    const entries = index[category];
    if (!Array.isArray(entries)) throw new Error('Invalid template group.');
    for (const key of entries) {
      if (typeof key !== 'string' || !/^[a-z0-9-]+$/.test(key) || keys.has(key)) {
        throw new Error('Invalid or duplicate template name.');
      }
      keys.add(key);
      templates.push({ key, category });
    }
  }
  return Promise.all(templates.map(async ({ key, category }) => ({
    key, category, ...parseTemplate(key, await read(key)),
  })));
}

export function getTemplates(): Promise<PatternTemplate[]> {
  pending ??= loadTemplates().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

export function makeCollection(open: (entry: Pattern, action: Action) => void) {
  const view = byId('collection-view');
  const gallery = byId('collection-gallery');
  const status = byId('collection-status');
  const retry = byId('collection-retry', 'button');
  const cardTemplate = byId('collection-card-template', 'template');
  const filters = [...view.querySelectorAll<HTMLButtonElement>('[data-category]')];
  const cards: { element: HTMLElement; category: Category }[] = [];
  let filter = 'all';
  let loading = false;

  function showFilter() {
    let shown = 0;
    for (const card of cards) {
      card.element.hidden = filter !== 'all' && card.category !== filter;
      if (!card.element.hidden) shown++;
    }
    for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.category === filter));
    status.textContent = shown + (shown === 1 ? ' pattern' : ' patterns');
  }

  function renderCard(template: PatternTemplate, largestPlanet: number) {
    const { category, pattern, recommended } = template;
    const article = document.importNode(cardTemplate.content, true).querySelector('article')!;
    const canvas = article.querySelector('canvas')!;
    const name = article.querySelector('h2')!;
    const details = article.querySelector('p')!;
    const edit = article.querySelector<HTMLButtonElement>('[data-template-action="edit"]')!;
    const crochet = article.querySelector<HTMLButtonElement>('[data-template-action="work"]')!;
    const colors = article.querySelector<HTMLSelectElement>('[data-template-colors]')!;
    const resolution = article.querySelector<HTMLSelectElement>('[data-template-resolution]')!;
    article.dataset.category = category;
    name.textContent = pattern.name;
    colors.setAttribute('aria-label', 'Colors for ' + pattern.name);
    resolution.setAttribute('aria-label', 'Resolution for ' + pattern.name);
    colors.closest('label')!.hidden = pattern.palette.length < 2;
    resolution.closest('label')!.hidden = pattern.rows === recommended.rows && pattern.cols === recommended.cols;
    setColorChoices(colors, template);
    let selected: Pattern;
    edit.setAttribute('aria-label', 'Edit ' + pattern.name);
    crochet.setAttribute('aria-label', 'Crochet ' + pattern.name);
    edit.addEventListener('click', () => open(selected, 'edit'));
    crochet.addEventListener('click', () => open(selected, 'work'));

    let render: (entry: Pattern) => void;
    if (pattern.shape === 'sphere') {
      article.dataset.shape = 'sphere';
      canvas.width = canvas.height = 160;
      canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', '3D preview of ' + pattern.name + '. Use arrow keys to rotate.');
      render = makeGlobe(canvas).show;
    } else {
      canvas.setAttribute('aria-label', 'Flat chart of ' + pattern.name);
      render = entry => {
        const longSide = Math.max(entry.rows, entry.cols);
        canvas.style.width = (entry.cols / longSide * 100) + '%';
        canvas.style.height = (entry.rows / longSide * 100) + '%';
        drawFlatPreview(canvas, entry);
      };
    }
    function updatePreview() {
      const size = resolution.value === 'high' ? pattern : recommended;
      const budget = Number(colors.value);
      selected = deriveTemplate(template, size, budget);
      const shapeSummary = selected.shape === 'sphere' ? selected.rows + ' rounds · 3D' :
        selected.cols + ' × ' + selected.rows + ' stitches';
      details.textContent = shapeSummary + (selected.palette.length < budget ?
        ' · ' + selected.palette.length + ' colors used' : '');
      if (category === 'space') {
        article.style.setProperty('--globe-size', Math.min(100, 35 + 65 * selected.rows / largestPlanet) + '%');
      }
      render(selected);
    }
    colors.addEventListener('change', updatePreview);
    resolution.addEventListener('change', updatePreview);
    updatePreview();
    return { element: article, category };
  }

  async function show() {
    if (cards.length || loading) return;
    loading = true;
    retry.hidden = true;
    status.textContent = 'Loading patterns…';
    try {
      const entries = await getTemplates();
      const largestPlanet = Math.max(1, ...entries.filter(entry => entry.category === 'space').map(entry => entry.recommended.rows));
      cards.push(...entries.map(entry => renderCard(entry, largestPlanet)));
      gallery.replaceChildren(...cards.map(card => card.element));
      showFilter();
    } catch {
      status.textContent = 'The pattern collection could not be loaded.';
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  for (const button of filters) {
    button.addEventListener('click', () => {
      filter = button.dataset.category ?? 'all';
      if (cards.length) showFilter();
    });
  }
  retry.addEventListener('click', show);
  return { show };
}
