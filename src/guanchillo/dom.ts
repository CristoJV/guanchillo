export function byId(id: string): HTMLElement;
export function byId<Tag extends keyof HTMLElementTagNameMap>(id: string, tag: Tag): HTMLElementTagNameMap[Tag];
export function byId(id: string, tag?: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element || (tag && element.localName !== tag)) throw new Error('Unexpected or missing element #' + id);
  return element;
}
