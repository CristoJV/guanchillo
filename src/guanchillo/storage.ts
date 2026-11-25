import { newProgress, parsePattern, parseProgress, type Pattern, type Progress } from './model.js';

export type Mode = 'edit' | 'work' | 'collection';

interface Preferences {
  activeId: string;
  mode: Mode;
}

const prefix = 'guanchillo:v1:';
const legacyPrefix = 'ganchillo:v1:';
const patternKey = (id: string) => prefix + 'pattern:' + id;
const progressKey = (id: string) => prefix + 'progress:' + id;
const preferencesKey = prefix + 'preferences';
const oldKey = (key: string) => legacyPrefix + key.slice(prefix.length);

export function createStorage(onError: (message: string) => void) {
  function read(key: string): unknown {
    try {
      const value = localStorage.getItem(key) ?? localStorage.getItem(oldKey(key));
      return value === null ? null : JSON.parse(value);
    } catch {
      onError('Some saved data could not be read.');
      return null;
    }
  }

  function write(key: string, value: Pattern | Progress | Preferences): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      onError('Could not save in this browser. Export the pattern to keep a copy.');
      return false;
    }
  }

  return {
    patterns() {
      const patterns = new Map<string, Pattern>();
      try {
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          if (!key) continue;
          const keyPrefix = [patternKey(''), legacyPrefix + 'pattern:'].find(prefix => key.startsWith(prefix));
          if (!keyPrefix) continue;
          const storedId = key.slice(keyPrefix.length);
          if (patterns.has(storedId)) continue;
          const raw = read(patternKey(storedId));
          if (!raw) continue;
          try {
            const { id, ...data } = parsePattern(raw);
            if (id && id === storedId) patterns.set(id, { ...data, id });
          } catch {
            onError('A saved pattern could not be opened.');
          }
        }
      } catch {
        onError('Local storage is unavailable in this browser.');
      }
      return patterns;
    },
    savePattern: (pattern: Pattern) => write(patternKey(pattern.id), pattern),
    progress: (pattern: Pattern) => parseProgress(pattern, read(progressKey(pattern.id))) ?? newProgress(pattern),
    saveProgress: (id: string, progress: Progress) => write(progressKey(id), progress),
    preferences(): Preferences | null {
      const value = read(preferencesKey);
      if (typeof value !== 'object' || !value || !('activeId' in value) || !('mode' in value)) return null;
      const { activeId, mode } = value;
      return typeof activeId === 'string' && (mode === 'edit' || mode === 'work' || mode === 'collection') ? { activeId, mode } : null;
    },
    savePreferences: (preferences: Preferences) => write(preferencesKey, preferences),
    removePattern(id: string) {
      try {
        for (const key of [patternKey(id), progressKey(id)]) {
          localStorage.removeItem(key);
          localStorage.removeItem(oldKey(key));
        }
        return true;
      } catch {
        onError('Could not delete the pattern from this browser.');
        return false;
      }
    },
  };
}
