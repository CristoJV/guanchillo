function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matchPatternName(query: string) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return (name: string) => {
    const normalized = normalize(name);
    return words.every(word => normalized.includes(word));
  };
}
