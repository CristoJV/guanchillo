import { applyColorProfile, reducePatternPalette } from './image-pattern.js';
import { limits, parsePattern, resamplePattern, type Dimensions, type Pattern } from './model.js';

export interface PatternTemplate {
  key: string;
  pattern: Pattern;
  recommended: Dimensions;
}

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
