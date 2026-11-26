import { hasStarted, totalSteps, type Pattern, type Progress } from '../../core/model.js';
import { matchPatternName } from '../../core/search.js';
import { byId, format, setText } from '../shared/dom.js';

interface LibraryOptions {
  patterns: () => Iterable<Pattern>;
  progress: (entry: Pattern) => Progress;
  currentId: () => string;
  open: (entry: Pattern, mode: 'edit' | 'work') => void;
  exportPattern: (entry: Pattern, progress: Progress) => void;
  remove: (entry: Pattern) => boolean;
}

export function makeLibrary(options: LibraryOptions) {
  const dialog = byId('library-dialog', 'dialog');
  const list = byId('library-list');
  const search = byId('library-search', 'input');
  const template = byId('library-item-template', 'template');

  function card(entry: Pattern) {
    const progress = options.progress(entry);
    const total = totalSteps(entry, progress);
    const complete = progress.offset === total;
    const action = complete ? 'View progress' : hasStarted(progress) ? 'Resume' : 'Crochet';
    const item = document.importNode(template.content, true).querySelector('li')!;
    if (entry.id === options.currentId()) item.setAttribute('aria-current', 'true');
    item.querySelector('h3')!.textContent = entry.name;
    item.querySelector('.library-size')!.textContent = entry.shape === 'sphere' ? `${entry.rows} rounds` : `${entry.rows} × ${entry.cols}`;
    item.querySelector('.library-progress')!.textContent = `${complete ? 'Complete · ' : ''}${format(progress.offset)} of ${format(total)} stitches`;

    const resume = item.querySelector<HTMLButtonElement>('[data-library-work]')!;
    resume.textContent = action;
    resume.setAttribute('aria-label', action + ' ' + entry.name);
    resume.addEventListener('click', () => {
      dialog.close();
      options.open(entry, 'work');
    });
    const edit = item.querySelector<HTMLButtonElement>('[data-library-edit]')!;
    edit.setAttribute('aria-label', 'Edit ' + entry.name);
    edit.addEventListener('click', () => {
      dialog.close();
      options.open(entry, 'edit');
    });
    const download = item.querySelector<HTMLButtonElement>('[data-library-export]')!;
    download.setAttribute('aria-label', 'Export ' + entry.name);
    download.addEventListener('click', () => options.exportPattern(entry, progress));
    const remove = item.querySelector<HTMLButtonElement>('[data-library-delete]')!;
    remove.setAttribute('aria-label', 'Delete pattern ' + entry.name);
    remove.addEventListener('click', () => {
      if (!options.remove(entry)) return;
      render();
      const active = list.querySelector<HTMLButtonElement>('[aria-current="true"] [data-library-work]');
      (active ?? search).focus();
    });
    return item;
  }

  function render() {
    const matches = matchPatternName(search.value);
    const entries = [...options.patterns()].filter(entry => matches(entry.name)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    list.replaceChildren(...entries.map(card));
    setText('library-status', entries.length ? `${format(entries.length)} ${entries.length === 1 ? 'pattern' : 'patterns'}` :
      'No saved patterns match.');
  }

  search.addEventListener('input', render);
  return {
    show() {
      search.value = '';
      render();
      dialog.showModal();
    },
  };
}
