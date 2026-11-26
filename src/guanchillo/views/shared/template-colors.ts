import { limits } from '../../core/model.js';
import type { PatternTemplate } from '../../core/templates.js';

export function setColorChoices(select: HTMLSelectElement, template?: PatternTemplate) {
  const max = template?.pattern.palette.length ?? 0;
  const options = Array.from({ length: max }, (_, index) => {
    const count = index + 1;
    const profile = template?.pattern.colorProfiles?.some(({ palette }) => palette.length === count);
    return new Option(`${count} ${count === 1 ? 'color' : 'colors'}${profile ? ' (profile)' : ''}`, String(count));
  });
  select.replaceChildren(...options);
  if (template) {
    const { rows, cols } = template.recommended;
    const nativeSize = rows === template.pattern.rows && cols === template.pattern.cols;
    select.value = String(nativeSize ? max : Math.min(limits.defaultColors, max));
  }
}
