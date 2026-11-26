import { counts, limits, type Pattern } from '../../core/model.js';
import { reducePatternPalette, removePatternColor, setPatternColor } from '../../core/image-pattern.js';
import { byId, format, setText, status } from '../shared/dom.js';

export function makePalette(applyChange: (next: Pattern) => void, usePencil: () => void) {
  const palette = byId('palette');
  let pattern: Pattern;
  let color = 0;
  let editingColor: number | null = null;

  function show(next: Pattern, reset: boolean) {
    pattern = next;
    color = Math.min(reset ? 1 : color, pattern.palette.length - 1);
    const fragment = document.createDocumentFragment();
    pattern.palette.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'palette-row';
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'color-choice';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.backgroundColor = entry.hex;
      const name = document.createElement('strong');
      name.textContent = entry.name;
      const count = document.createElement('span');
      count.className = 'color-count';
      select.append(swatch, name, count);
      select.addEventListener('click', () => {
        color = index;
        usePencil();
        updateCounts();
      });
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'icon-button color-edit';
      edit.setAttribute('aria-label', 'Edit color ' + entry.name);
      edit.title = 'Edit color';
      edit.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#pencil"></use></svg>';
      edit.addEventListener('click', () => openColor(index));
      row.append(select, edit);
      fragment.append(row);
    });
    palette.replaceChildren(fragment);
    byId('color-add', 'button').disabled = pattern.palette.length >= limits.colors;
    byId('reduce-colors', 'button').disabled = pattern.palette.length < 2;
    updateCounts();
  }

  function updateCounts() {
    const stats = counts(pattern);
    for (const [index, row] of Array.from(palette.children).entries()) {
      const count = stats.colors[index];
      const selected = index === color;
      row.classList.toggle('selected', selected);
      const choice = row.firstElementChild;
      choice?.setAttribute('aria-pressed', String(selected));
      if (choice?.lastElementChild) choice.lastElementChild.textContent = format(count);
    }
    setText('empty-count', format(stats.empty));
  }

  function openColor(index: number | null = null) {
    editingColor = index;
    const entry = index === null ? undefined : pattern.palette[index];
    byId('color-name', 'input').value = entry?.name ?? '';
    byId('color-value', 'input').value = entry?.hex ?? '#739a8c';
    setText('color-dialog-title', entry ? 'Edit color' : 'Add color');
    byId('color-delete', 'button').hidden = !entry || pattern.palette.length === 1;
    byId('color-dialog', 'dialog').showModal();
  }

  function returnToColor(index: number) {
    const button = palette.children[index]?.querySelector('.color-choice');
    (button instanceof HTMLButtonElement ? button : byId('color-add', 'button')).focus();
  }

  byId('color-form').addEventListener('submit', event => {
    event.preventDefault();
    if (editingColor === null && pattern.palette.length >= limits.colors) return;
    const name = byId('color-name', 'input').value.trim();
    if (!name) {
      byId('color-name', 'input').value = '';
      byId('color-name', 'input').reportValidity();
      return;
    }
    const index = editingColor ?? pattern.palette.length;
    color = index;
    applyChange(setPatternColor(pattern, index, { name, hex: byId('color-value', 'input').value }));
    usePencil();
    byId('color-dialog', 'dialog').close();
    returnToColor(index);
  });

  const removeColorDialog = byId('remove-color-dialog', 'dialog');

  function deleteColor(fill: boolean) {
    if (editingColor === null || pattern.palette.length === 1) return;
    const removed = editingColor;
    const remapped = removePatternColor(pattern, removed, fill);
    color = color > removed ? color - 1 : Math.min(color, remapped.palette.length - 1);
    applyChange({ ...pattern, ...remapped });
    removeColorDialog.close();
    byId('color-dialog', 'dialog').close();
    returnToColor(color);
  }

  byId('color-delete', 'button').addEventListener('click', () => {
    if (editingColor === null || pattern.palette.length === 1) return;
    const stitches = counts(pattern).colors[editingColor];
    if (stitches === 0) {
      deleteColor(false);
      return;
    }
    const name = pattern.palette[editingColor].name;
    setText('remove-color-note', `What should happen to the ${format(stitches)} ${stitches === 1 ? 'stitch' : 'stitches'} using ${name}?`);
    removeColorDialog.showModal();
  });
  byId('remove-color-fill').addEventListener('click', () => deleteColor(true));
  byId('remove-color-unassigned').addEventListener('click', () => deleteColor(false));

  const reduceColorDialog = byId('reduce-color-dialog', 'dialog');
  const reduceColorCount = byId('reduce-color-count', 'select');

  function colorReduction() {
    return reducePatternPalette(pattern, Number(reduceColorCount.value), { keepUnused: true });
  }

  function updateReductionPreview() {
    const swatches = colorReduction().palette.map(({ name, hex }) => {
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.backgroundColor = hex;
      swatch.setAttribute('role', 'listitem');
      swatch.setAttribute('aria-label', name);
      swatch.title = name;
      return swatch;
    });
    byId('reduce-color-preview').replaceChildren(...swatches);
  }

  byId('reduce-colors').addEventListener('click', () => {
    const options = Array.from({ length: pattern.palette.length - 1 }, (_, index) => {
      const count = index + 1;
      const profile = pattern.colorProfiles?.some(({ palette }) => palette.length === count);
      return new Option(`${count} ${count === 1 ? 'color' : 'colors'}${profile ? ' (profile)' : ''}`, String(count));
    });
    reduceColorCount.replaceChildren(...options);
    reduceColorCount.value = String(options.length);
    updateReductionPreview();
    reduceColorDialog.showModal();
  });
  reduceColorCount.addEventListener('change', updateReductionPreview);
  byId('reduce-color-form', 'form').addEventListener('submit', event => {
    event.preventDefault();
    const reduction = colorReduction();
    applyChange({ ...pattern, ...reduction });
    reduceColorDialog.close();
    if (reduction.palette.length === 1) returnToColor(color);
    status(`Palette reduced to ${reduction.palette.length} ${reduction.palette.length === 1 ? 'color' : 'colors'}.`);
  });

  byId('color-add', 'button').addEventListener('click', () => openColor());
  return { show, updateCounts, selected: () => color };
}
