import { byId } from './dom.js';
import { makeGlobe } from './globe.js';
import { parsePattern, type Pattern } from './model.js';
import { drawFlatPreview } from './preview.js';

const categories = ['space', 'holiday', 'pixel'] as const;
type Category = (typeof categories)[number];
type Action = 'edit' | 'work';

export interface PatternTemplate {
  key: string;
  category: Category;
  pattern: Pattern;
}

let pending: Promise<PatternTemplate[]> | undefined;

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
  return Promise.all(templates.map(async ({ key, category }) => {
    const { id, ...pattern } = parsePattern(await read(key));
    if (id !== 'guanchillo-template-' + key) throw new Error('Invalid template identity.');
    return { key, category, pattern: { ...pattern, id } };
  }));
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

  function renderCard({ category, pattern }: PatternTemplate) {
    const article = document.importNode(cardTemplate.content, true).querySelector('article')!;
    const canvas = article.querySelector('canvas')!;
    const name = article.querySelector('h2')!;
    const details = article.querySelector('p')!;
    const edit = article.querySelector<HTMLButtonElement>('[data-template-action="edit"]')!;
    const crochet = article.querySelector<HTMLButtonElement>('[data-template-action="work"]')!;
    article.dataset.category = category;
    name.textContent = pattern.name;
    edit.setAttribute('aria-label', 'Edit ' + pattern.name);
    crochet.setAttribute('aria-label', 'Crochet ' + pattern.name);
    edit.addEventListener('click', () => open(pattern, 'edit'));
    crochet.addEventListener('click', () => open(pattern, 'work'));

    if (pattern.shape === 'sphere') {
      article.dataset.shape = 'sphere';
      details.textContent = pattern.rows + ' rounds · 3D';
      canvas.width = canvas.height = 160;
      canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', '3D preview of ' + pattern.name + '. Use arrow keys to rotate.');
      makeGlobe(canvas).show(pattern);
    } else {
      details.textContent = pattern.cols + ' × ' + pattern.rows + ' stitches';
      canvas.setAttribute('aria-label', 'Flat chart of ' + pattern.name);
      const longSide = Math.max(pattern.rows, pattern.cols);
      canvas.style.width = (pattern.cols / longSide * 100) + '%';
      canvas.style.height = (pattern.rows / longSide * 100) + '%';
      drawFlatPreview(canvas, pattern);
    }
    return { element: article, category };
  }

  async function show() {
    if (cards.length || loading) return;
    loading = true;
    retry.hidden = true;
    status.textContent = 'Loading patterns…';
    try {
      const entries = await getTemplates();
      cards.push(...entries.map(renderCard));
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
