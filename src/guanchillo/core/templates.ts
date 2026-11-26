import { applyColorProfile, reducePatternPalette } from './image-pattern.js';
import { limits, parsePattern, resamplePattern, type Dimensions, type Pattern } from './model.js';

export interface PatternTemplate {
  key: string;
  pattern: Pattern;
  recommended: Dimensions;
  variantRevisions?: Readonly<Record<number, number>>;
}

type TemplateMaster = Omit<PatternTemplate, 'key'>;

function readVariantRevisions(file: unknown, colors: number): TemplateMaster['variantRevisions'] {
  if (!file || typeof file !== 'object' || !('variantRevisions' in file)) return;
  const revisions = file.variantRevisions;
  if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)) {
    throw new Error('Invalid template variant revisions.');
  }
  const parsed: Record<number, number> = {};
  for (const [budget, revision] of Object.entries(revisions)) {
    if (!/^[1-9]$/.test(budget) || Number(budget) > colors || !Number.isSafeInteger(revision) || revision < 2) {
      throw new Error('Invalid template variant revision.');
    }
    parsed[Number(budget)] = revision;
  }
  return parsed;
}

export function parseTemplate(key: string, file: unknown): TemplateMaster {
  const { id, ...master } = parsePattern(file);
  if (id !== 'guanchillo-template-' + key || master.palette.length > limits.colors) {
    throw new Error('Invalid template identity or palette.');
  }
  if (!master.recommended) throw new Error('Missing recommended template size.');
  const variantRevisions = readVariantRevisions(file, master.palette.length);
  return { pattern: { ...master, id }, recommended: master.recommended, variantRevisions };
}

export function deriveTemplate(template: Pick<PatternTemplate, 'pattern' | 'variantRevisions'>, size: Dimensions, colors: number): Pattern {
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
  const revision = template.variantRevisions?.[colors];
  const profileId = master.colorProfiles?.length ? '-profile' : '';
  return {
    ...resized, ...(exactPalette ? {} : reducePatternPalette(resized, colors)),
    id: resized.id + '-' + resized.rows + 'x' + resized.cols + '-' + colors + '-colors' + profileId +
      (revision ? '-r' + revision : ''),
  };
}
