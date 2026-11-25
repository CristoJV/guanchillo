import { byId } from './dom.js';
import { makeGlobe } from './globe.js';
import { applyColorProfile, reducePatternPalette } from './image-pattern.js';
import { counts, limits, parsePattern, resamplePattern, type Dimensions, type Pattern } from './model.js';
import { drawFlatPreview } from './preview.js';
import { isSphereSize } from './sphere.js';

type Action = 'edit' | 'work';

export interface PatternTemplate {
  key: string;
  pattern: Pattern;
  recommended: Dimensions;
}

let pending: Promise<PatternTemplate[]> | undefined;

export function parseTemplate(key: string, file: unknown): Pick<PatternTemplate, 'pattern' | 'recommended'> {
  const { id, ...master } = parsePattern(file);
  if (id !== 'guanchillo-template-' + key || master.palette.length > limits.colors) {
    throw new Error('Invalid template identity or palette.');
  }
  if (!master.recommended) throw new Error('Missing recommended template size.');
  return { pattern: { ...master, id }, recommended: master.recommended };
}

export function deriveTemplate(template: Pick<PatternTemplate, 'pattern'>, size: Dimensions, colors: number): Pattern {
  if (!Number.isInteger(size.rows) || size.rows < 1 || !Number.isInteger(size.cols) || size.cols < 1 ||
    (template.pattern.shape === 'sphere' && size.cols !== size.rows * 2)) {
    throw new Error('Invalid template dimensions.');
  }
  if (size.rows > template.pattern.rows || size.cols > template.pattern.cols) {
    throw new Error('Template size exceeds its master chart.');
  }
  const master = template.pattern;
  const profile = applyColorProfile(master, colors);
  const exactPalette = profile !== undefined || (Boolean(master.colorProfiles?.length) && colors === master.palette.length);
  const resized = resamplePattern({ ...master, ...profile }, size.rows, size.cols);
  return {
    ...resized, ...(exactPalette ? {} : reducePatternPalette(resized, colors)),
    id: resized.id + '-' + resized.rows + 'x' + resized.cols + '-' + colors + '-colors' + (master.colorProfiles?.length ? '-profile' : ''),
  };
}

export function setColorChoices(select: HTMLSelectElement, template?: PatternTemplate) {
  const max = template?.pattern.palette.length ?? 0;
  const options = Array.from({ length: max }, (_, index) => {
    const count = index + 1;
    const profile = template?.pattern.colorProfiles?.some(({ palette }) => palette.length === count);
    return new Option(`${count} ${count === 1 ? 'color' : 'colors'}${profile ? ' (profile)' : ''}`, String(count));
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
  if (typeof manifest !== 'object' || !manifest || !('patterns' in manifest) || !Array.isArray(manifest.patterns)) {
    throw new Error('Invalid template index.');
  }
  const keys = manifest.patterns.map((key: unknown) => {
    if (typeof key !== 'string' || key === 'index' || !/^[a-z0-9-]+$/.test(key)) {
      throw new Error('Invalid template name.');
    }
    return key;
  });
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate template name.');
  return Promise.all(keys.map(async key => ({ key, ...parseTemplate(key, await read(key)) })));
}

export function getTemplates(): Promise<PatternTemplate[]> {
  pending ??= loadTemplates().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

function filterLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('-', ' ');
}

export function makeCollection(open: (entry: Pattern, action: Action) => void) {
  const gallery = byId('collection-gallery');
  const status = byId('collection-status');
  const retry = byId('collection-retry', 'button');
  const cardTemplate = byId('collection-card-template', 'template');
  const tagFilter = byId('collection-tag', 'select');
  const shapeFilter = byId('collection-shape', 'select');
  const cards: { element: HTMLElement; pattern: Pattern }[] = [];
  let loaded = false;
  let loading = false;

  function showFilter() {
    let shown = 0;
    for (const card of cards) {
      const { shape, tags } = card.pattern;
      card.element.hidden = (tagFilter.value !== '' && !tags.includes(tagFilter.value)) ||
        (shapeFilter.value !== '' && shape !== shapeFilter.value);
      if (!card.element.hidden) shown++;
    }
    status.textContent = shown ? shown + (shown === 1 ? ' pattern' : ' patterns') : 'No patterns match these filters.';
  }

  function renderCard(template: PatternTemplate, largestSphere: number) {
    const { pattern, recommended } = template;
    const article = document.importNode(cardTemplate.content, true).querySelector('article')!;
    const canvas = article.querySelector('canvas')!;
    const name = article.querySelector('h2')!;
    const summary = article.querySelector('p')!;
    const edit = article.querySelector<HTMLButtonElement>('[data-template-action="edit"]')!;
    const crochet = article.querySelector<HTMLButtonElement>('[data-template-action="work"]')!;
    const colors = article.querySelector<HTMLSelectElement>('[data-template-colors]')!;
    const resolution = article.querySelector<HTMLSelectElement>('[data-template-resolution]')!;
    article.dataset.shape = pattern.shape;
    name.textContent = pattern.name;
    const tagList = article.querySelector('.template-tags')!;
    for (const tag of pattern.tags) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = filterLabel(tag);
      button.addEventListener('click', () => {
        tagFilter.value = tag;
        showFilter();
      });
      tagList.append(button);
    }
    if (pattern.source) {
      const source = article.querySelector('details')!;
      const link = source.querySelector('a')!;
      const note = source.querySelector('p')!;
      source.hidden = false;
      link.href = pattern.source.url;
      link.textContent = pattern.source.title;
      note.hidden = !pattern.source.note;
      note.textContent = pattern.source.note ?? '';
    }
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
      const used = counts(selected).colors.filter(count => count > 0).length;
      summary.textContent = shapeSummary + (used < budget ? ' · ' + used + ' colors used' : '');
      if (selected.shape === 'sphere') {
        article.style.setProperty('--globe-size', Math.min(100, 35 + 65 * selected.rows / largestSphere) + '%');
      }
      render(selected);
    }
    colors.addEventListener('change', updatePreview);
    resolution.addEventListener('change', updatePreview);
    updatePreview();
    return { element: article, pattern };
  }

  async function show() {
    if (loaded || loading) return;
    loading = true;
    retry.hidden = true;
    status.textContent = 'Loading patterns…';
    try {
      const entries = await getTemplates();
      const largestSphere = Math.max(1, ...entries.filter(entry => entry.pattern.shape === 'sphere').map(entry => entry.recommended.rows));
      cards.push(...entries.map(entry => renderCard(entry, largestSphere)));
      gallery.replaceChildren(...cards.map(card => card.element));
      for (const [select, values] of [
        [tagFilter, entries.flatMap(entry => entry.pattern.tags)],
        [shapeFilter, entries.map(entry => entry.pattern.shape)],
      ] as const) {
        const options = [...new Set(values)].sort((a, b) => a.localeCompare(b));
        select.append(...options.map(value => new Option(filterLabel(value), value)));
        select.disabled = options.length === 0;
      }
      loaded = true;
      showFilter();
    } catch {
      status.textContent = 'The pattern collection could not be loaded.';
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  tagFilter.addEventListener('change', showFilter);
  shapeFilter.addEventListener('change', showFilter);
  retry.addEventListener('click', show);
  return { show };
}
