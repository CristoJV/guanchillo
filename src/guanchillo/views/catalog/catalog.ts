import { matchPatternName } from '../../core/search.js';
import { counts, type Pattern } from '../../core/model.js';
import { deriveTemplate, type PatternTemplate } from '../../core/templates.js';
import { getTemplates } from '../../platform/templates.js';
import { byId } from '../shared/dom.js';
import { makeGlobe } from '../shared/globe.js';
import { drawFlatPreview } from '../shared/preview.js';
import { setColorChoices } from '../shared/template-colors.js';

type Action = 'edit' | 'work';

function filterLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('-', ' ');
}

export function makeCatalog(open: (entry: Pattern, action: Action) => void) {
  const gallery = byId('catalog-gallery');
  const status = byId('catalog-status');
  const retry = byId('catalog-retry', 'button');
  const reset = byId('catalog-reset', 'button');
  const search = byId('catalog-search', 'input');
  const cardTemplate = byId('catalog-card-template', 'template');
  const tagFilter = byId('catalog-tag', 'select');
  const shapeFilter = byId('catalog-shape', 'select');
  const cards: { element: HTMLElement; pattern: Pattern }[] = [];
  let loaded = false;
  let loading = false;
  const previews = new Map<Element, () => void>();
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer?.unobserve(target);
      const draw = previews.get(target);
      previews.delete(target);
      draw?.();
    }
  }, { rootMargin: '160px' }) : undefined;

  function showFilter() {
    if (!loaded) return;
    const matches = matchPatternName(search.value);
    reset.hidden = !search.value.trim() && !tagFilter.value && !shapeFilter.value;
    let shown = 0;
    for (const card of cards) {
      const { name, shape, tags } = card.pattern;
      card.element.hidden = !matches(name) || (tagFilter.value !== '' && !tags.includes(tagFilter.value)) ||
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
    let selected: Pattern | undefined;
    let draw: ((entry: Pattern) => void) | undefined;
    const size = () => resolution.value === 'high' ? pattern : recommended;
    const budget = () => Number(colors.value);
    const selection = () => selected ??= deriveTemplate(template, size(), budget());

    edit.setAttribute('aria-label', 'Edit ' + pattern.name);
    crochet.setAttribute('aria-label', 'Crochet ' + pattern.name);
    edit.addEventListener('click', () => open(selection(), 'edit'));
    crochet.addEventListener('click', () => open(selection(), 'work'));

    function makePreview() {
      canvas.removeAttribute('aria-hidden');
      if (pattern.shape === 'sphere') {
        canvas.width = canvas.height = 160;
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', '3D preview of ' + pattern.name + '. Use arrow keys to rotate.');
        return makeGlobe(canvas).show;
      }
      canvas.setAttribute('aria-label', 'Flat chart of ' + pattern.name);
      return (entry: Pattern) => {
        const longSide = Math.max(entry.rows, entry.cols);
        canvas.style.width = (entry.cols / longSide * 100) + '%';
        canvas.style.height = (entry.rows / longSide * 100) + '%';
        drawFlatPreview(canvas, entry);
      };
    }

    function updatePreview() {
      const { rows, cols } = size();
      const description = pattern.shape === 'sphere' ? rows + ' rounds · 3D' : cols + ' × ' + rows + ' stitches';
      if (!draw) {
        summary.textContent = description;
        return;
      }
      const entry = selection();
      const used = counts(entry).colors.filter(count => count > 0).length;
      summary.textContent = description + (used < budget() ? ' · ' + used + ' colors used' : '');
      if (entry.shape === 'sphere') {
        article.style.setProperty('--globe-size', Math.min(100, 35 + 65 * rows / largestSphere) + '%');
      }
      draw(entry);
    }

    function changed() {
      selected = undefined;
      updatePreview();
    }
    colors.addEventListener('change', changed);
    resolution.addEventListener('change', changed);
    const showPreview = () => {
      draw = makePreview();
      updatePreview();
    };
    if (observer) {
      updatePreview();
      previews.set(article, showPreview);
      observer.observe(article);
    } else showPreview();
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
      status.textContent = 'The pattern catalog could not be loaded.';
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  search.addEventListener('input', showFilter);
  reset.addEventListener('click', () => {
    search.value = tagFilter.value = shapeFilter.value = '';
    showFilter();
    search.focus();
  });
  tagFilter.addEventListener('change', showFilter);
  shapeFilter.addEventListener('change', showFilter);
  retry.addEventListener('click', show);
  return { show };
}
