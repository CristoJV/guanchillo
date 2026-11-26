import { parseTemplate, type PatternTemplate } from '../core/templates.js';

let pending: Promise<PatternTemplate[]> | undefined;

async function loadTemplates(): Promise<PatternTemplate[]> {
  const directory = new URL('patterns/', document.baseURI);
  async function read(name: string): Promise<unknown> {
    const response = await fetch(new URL(name + '.json', directory));
    if (!response.ok) throw new Error('Could not load the pattern catalog.');
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
