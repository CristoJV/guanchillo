import { copyPattern, limits, newPattern, newSphere, type Pattern } from '../../core/model.js';
import { isSphereSize, sphereLayout, sphereSizes } from '../../core/sphere.js';
import { deriveTemplate, type PatternTemplate } from '../../core/templates.js';
import { getTemplates } from '../../platform/templates.js';
import { byId, format, setText, status } from '../shared/dom.js';
import { makeGlobe } from '../shared/globe.js';
import { setColorChoices } from '../shared/template-colors.js';

export function bindNewPattern(onCreate: (pattern: Pattern) => void) {
  const createGlobe = makeGlobe(byId('create-globe', 'canvas'));

  const newShape = byId('new-shape', 'select');
  const newTemplate = byId('new-template', 'select');
  const newTemplateColors = byId('new-template-colors', 'select');
  const newRounds = byId('new-rounds', 'input');
  const newRows = byId('new-rows', 'input');
  const newCols = byId('new-cols', 'input');
  const newName = byId('new-name', 'input');
  const patternDialog = byId('pattern-dialog', 'dialog');
  let creationTemplates: PatternTemplate[] = [];
  let suggestedName = '';

  function selectedTemplate(): PatternTemplate | undefined {
    return creationTemplates.find(entry => entry.key === newTemplate.value);
  }

  function refreshTemplateOptions() {
    const sphere = newShape.value === 'sphere';
    const previous = newTemplate.value;
    const matching = creationTemplates.filter(({ pattern }) => (pattern.shape === 'sphere') === sphere);
    newTemplate.replaceChildren(new Option('Blank', 'blank'), ...matching.map(({ pattern, key }) => new Option(pattern.name, key)));
    if (matching.some(({ key }) => key === previous)) newTemplate.value = previous;
  }

  function patternDraft(name: string): Pattern {
    const sphere = newShape.value === 'sphere';
    const rows = sphere ? newRounds.valueAsNumber : newRows.valueAsNumber;
    const cols = sphere ? rows * 2 : newCols.valueAsNumber;
    const template = selectedTemplate();
    if (template) {
      return copyPattern(deriveTemplate(template, { rows, cols }, Number(newTemplateColors.value)), name);
    }
    return sphere ? newSphere(rows, name) : newPattern(rows, cols, name);
  }

  function refreshCreation() {
    const sphere = newShape.value === 'sphere';
    patternDialog.dataset.shape = newShape.value;
    byId('new-flat-fields').hidden = sphere;
    byId('new-sphere-fields').hidden = !sphere;
    newRows.disabled = sphere;
    newCols.disabled = sphere;
    newRounds.disabled = !sphere;
    const rounds = newRounds.valueAsNumber;
    const showPreview = sphere && isSphereSize(rounds) && newRounds.validity.valid;
    byId('create-sphere-view').hidden = !showPreview;
    if (!showPreview) {
      setText('sphere-summary', '');
      return;
    }
    const { goreWidth, stitches } = sphereLayout(rounds);
    setText('sphere-summary', format(goreWidth * 6) + ' stitches at widest · ' + format(stitches) + ' total');
    createGlobe.show(patternDraft(newName.value));
  }

  function applyTemplateChoice() {
    const template = selectedTemplate();
    const chosen = template?.pattern;
    setColorChoices(newTemplateColors, template);
    byId('new-template-colors-field').hidden = !chosen || chosen.palette.length < 2;
    if (!newName.value.trim() || newName.value === suggestedName) newName.value = chosen?.name ?? '';
    suggestedName = chosen?.name ?? '';
    newRounds.max = String(chosen?.shape === 'sphere' ? chosen.rows : sphereSizes.max);
    newRows.max = String(chosen && chosen.shape !== 'sphere' ? chosen.rows : limits.dimension);
    newCols.max = String(chosen && chosen.shape !== 'sphere' ? chosen.cols : limits.dimension);
    setText('new-rounds-note', 'Use a multiple of 3 from 6 to ' + newRounds.max + '.');
    if (template) {
      if (template.pattern.shape === 'sphere') newRounds.valueAsNumber = template.recommended.rows;
      else {
        newRows.valueAsNumber = template.recommended.rows;
        newCols.valueAsNumber = template.recommended.cols;
      }
    }
    refreshCreation();
  }

  newShape.addEventListener('change', () => {
    refreshTemplateOptions();
    applyTemplateChoice();
  });
  newRounds.addEventListener('input', refreshCreation);
  newRows.addEventListener('input', () => {
    const master = selectedTemplate()?.pattern;
    if (newShape.value !== 'flat' || !master || !newRows.validity.valid) return;
    newCols.valueAsNumber = Math.max(1, Math.round(newRows.valueAsNumber * master.cols / master.rows));
  });
  newTemplate.addEventListener('change', applyTemplateChoice);
  newTemplateColors.addEventListener('change', refreshCreation);

  byId('create-form', 'form').addEventListener('submit', event => {
    event.preventDefault();
    const name = newName.value.trim();
    if (!name) {
      newName.value = '';
      newName.reportValidity();
      return;
    }
    const fresh = patternDraft(name);
    patternDialog.close();
    onCreate(fresh);
    status('Created “' + fresh.name + '”.');
  });

  byId('new-pattern').addEventListener('click', async () => {
    byId('create-form', 'form').reset();
    suggestedName = '';
    newTemplate.value = 'blank';
    refreshTemplateOptions();
    applyTemplateChoice();
    patternDialog.showModal();
    const templateStatus = byId('new-template-status');
    templateStatus.hidden = creationTemplates.length > 0;
    templateStatus.textContent = 'Loading templates…';
    try {
      creationTemplates = await getTemplates();
      refreshTemplateOptions();
      templateStatus.hidden = true;
    } catch {
      templateStatus.hidden = false;
      templateStatus.textContent = 'Templates could not be loaded.';
    }
  });
}
