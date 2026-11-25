import { byId } from './dom.js';
import { quantizeImage } from './image-pattern.js';
import { limits, newPattern, type Pattern } from './model.js';
import { drawFlatPreview } from './preview.js';

const maxFileBytes = 20_000_000;
const maxImagePixels = 24_000_000;
const defaultPalette = ['#244d45', '#c46f57', '#f4e6c8', '#325f80'];

export function makeImageImporter(onCreate: (pattern: Pattern) => void) {
  const dialog = byId('image-dialog', 'dialog');
  const form = byId('image-form', 'form');
  const file = byId('image-file', 'input');
  const rows = byId('image-rows', 'input');
  const cols = byId('image-cols', 'input');
  const paletteMode = byId('image-palette-mode', 'select');
  const colorCount = byId('image-colors', 'input');
  const paletteList = byId('image-custom-colors');
  const add = byId('image-color-add', 'button');
  const create = byId('image-create', 'button');
  const preview = byId('image-preview', 'canvas');
  const previewStatus = byId('image-preview-status');
  const error = byId('image-error');
  const source = document.createElement('canvas');

  let bitmap: ImageBitmap | undefined;
  let colors = [...defaultPalette];
  let revision = 0;
  let frame = 0;

  function showError(message: string) {
    error.textContent = message;
    error.hidden = !message;
  }

  function makePattern(): Pattern | null {
    if (!bitmap || !form.checkValidity()) return null;
    const height = rows.valueAsNumber;
    const width = cols.valueAsNumber;
    source.width = width;
    source.height = height;
    const context = source.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = width < bitmap.width || height < bitmap.height;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const selectedColors = paletteMode.value === 'custom' ? colors : colorCount.valueAsNumber;
    const name = file.files?.[0]?.name.replace(/\.[^.]+$/, '').trim().slice(0, limits.name) || 'Imported image';
    return { ...newPattern(height, width, name), ...quantizeImage(data, selectedColors) };
  }

  function refreshPreview() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const pattern = makePattern();
      create.disabled = !pattern;
      preview.hidden = !pattern;
      if (!pattern) {
        previewStatus.textContent = bitmap ? 'Enter valid stitch dimensions and color settings.' :
          'Choose an image to see its stitch preview.';
        return;
      }
      drawFlatPreview(preview, pattern);
      previewStatus.textContent = `${pattern.cols} × ${pattern.rows} stitches · ${pattern.palette.length} colors`;
    });
  }

  function renderColors(focusIndex?: number) {
    const swatches = colors.map((hex, index) => {
      const swatch = document.createElement('div');
      swatch.className = 'image-color';
      const input = document.createElement('input');
      input.type = 'color';
      input.value = hex;
      input.setAttribute('aria-label', 'Color ' + (index + 1));
      input.addEventListener('input', () => { colors[index] = input.value; });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button';
      remove.textContent = '×';
      remove.disabled = colors.length === 1;
      remove.setAttribute('aria-label', 'Remove color ' + (index + 1));
      remove.addEventListener('click', () => {
        colors.splice(index, 1);
        renderColors(Math.min(index, colors.length - 1));
        refreshPreview();
      });
      swatch.append(input, remove);
      return swatch;
    });
    paletteList.replaceChildren(...swatches);
    add.disabled = colors.length >= limits.colors;
    if (focusIndex !== undefined) swatches[focusIndex].querySelector('input')?.focus();
  }

  function updatePalette() {
    const custom = paletteMode.value === 'custom';
    byId('image-automatic-fields').hidden = custom;
    byId('image-fixed-fields').hidden = !custom;
    colorCount.disabled = custom;
    refreshPreview();
  }

  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    const current = ++revision;
    bitmap?.close();
    bitmap = undefined;
    create.disabled = true;
    preview.hidden = true;
    showError('');
    if (!selected) {
      refreshPreview();
      return;
    }
    if (selected.size > maxFileBytes) {
      showError('Choose an image smaller than 20 MB.');
      refreshPreview();
      return;
    }
    previewStatus.textContent = 'Reading image…';
    try {
      const decoded = await createImageBitmap(selected);
      if (revision !== current) {
        decoded.close();
        return;
      }
      if (decoded.width * decoded.height > maxImagePixels) {
        decoded.close();
        showError('Choose an image of up to 24 megapixels.');
      } else {
        bitmap = decoded;
        const scale = Math.min(1, 48 / Math.max(bitmap.width, bitmap.height));
        cols.valueAsNumber = Math.max(1, Math.round(bitmap.width * scale));
        rows.valueAsNumber = Math.max(1, Math.round(bitmap.height * scale));
      }
    } catch {
      if (revision === current) showError('This image could not be read. Try a PNG, JPEG, or WebP file.');
    }
    if (revision === current) refreshPreview();
  });

  form.addEventListener('input', event => {
    if (event.target !== file && event.target !== paletteMode) refreshPreview();
  });
  paletteMode.addEventListener('change', updatePalette);
  add.addEventListener('click', () => {
    colors.push('#ffffff');
    renderColors(colors.length - 1);
    refreshPreview();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const pattern = makePattern();
    if (!pattern) return;
    dialog.close();
    onCreate(pattern);
  });

  dialog.addEventListener('close', () => {
    ++revision;
    cancelAnimationFrame(frame);
    bitmap?.close();
    bitmap = undefined;
  });

  return {
    open() {
      form.reset();
      colors = [...defaultPalette];
      renderColors();
      showError('');
      preview.hidden = true;
      create.disabled = true;
      updatePalette();
      dialog.showModal();
    },
  };
}
