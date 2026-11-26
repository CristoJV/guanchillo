export function byId(id: string): HTMLElement;
export function byId<Tag extends keyof HTMLElementTagNameMap>(id: string, tag: Tag): HTMLElementTagNameMap[Tag];
export function byId(id: string, tag?: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element || (tag && element.localName !== tag)) throw new Error('Unexpected or missing element #' + id);
  return element;
}

const number = new Intl.NumberFormat('en');
export const format = (value: number) => number.format(value);
export const setText = (id: string, value: string | number) => { byId(id).textContent = String(value); };
export const status = (message: string) => setText('app-status', message);
