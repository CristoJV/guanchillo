export type CrochetAction = 'advance' | 'back';
export type MouseButton = 0 | 1 | 2;
export type Binding = { kind: 'key'; code: string; label: string } | { kind: 'mouse'; button: MouseButton };
export type CrochetControls = Partial<Record<CrochetAction, Binding>>;

export function isMouseButton(value: unknown): value is MouseButton {
  return value === 0 || value === 1 || value === 2;
}

const reservedKeys = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock',
  'NumLock', 'ScrollLock', 'ContextMenu', 'Unidentified', 'Dead', 'Process']);

export function keyBinding(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'isComposing'>):
  Binding | undefined {
  const { key, code, ctrlKey, altKey, metaKey, shiftKey, isComposing } = event;
  if (ctrlKey || altKey || metaKey || shiftKey || isComposing || !key || reservedKeys.has(key) || /^F\d+$/.test(key)) return;
  return { kind: 'key', code: code && code !== 'Unidentified' ? code : key, label: key === ' ' ? 'Space' : key };
}

function parseBinding(value: unknown): Binding | undefined {
  if (!value || typeof value !== 'object' || !('kind' in value)) return;
  if (value.kind === 'mouse' && 'button' in value && isMouseButton(value.button)) {
    return { kind: 'mouse', button: value.button };
  }
  if (value.kind === 'key' && 'code' in value && 'label' in value &&
    typeof value.code === 'string' && value.code.length > 0 && value.code.length <= 40 &&
    typeof value.label === 'string' && value.label.trim().length > 0 && value.label.length <= 40 &&
    !reservedKeys.has(value.code) && !/^F\d+$/.test(value.code)) {
    return { kind: 'key', code: value.code, label: value.label };
  }
}

export function sameBinding(first: Binding | undefined, second: Binding | undefined): boolean {
  return first?.kind === 'mouse' ? second?.kind === 'mouse' && first.button === second.button :
    first?.kind === 'key' && second?.kind === 'key' && first.code === second.code;
}

export function parseCrochetControls(value: unknown): CrochetControls {
  if (!value || typeof value !== 'object') return {};
  const advance = 'advance' in value ? parseBinding(value.advance) : undefined;
  const back = 'back' in value ? parseBinding(value.back) : undefined;
  return { ...(advance && { advance }), ...(back && !sameBinding(advance, back) && { back }) };
}

export function actionFor(controls: CrochetControls, input: Binding): CrochetAction | undefined {
  if (sameBinding(controls.advance, input)) return 'advance';
  if (sameBinding(controls.back, input)) return 'back';
  if (input.kind === 'mouse') return input.button === 0 ? 'advance' : undefined;
  if (input.code === 'ArrowLeft') return 'back';
  if (['Space', ' ', 'Enter', 'NumpadEnter', 'ArrowRight'].includes(input.code)) return 'advance';
}

export const bindingLabel = (binding: Binding) => binding.kind === 'key' ? binding.label :
  ['Left mouse button', 'Middle mouse button', 'Right mouse button'][binding.button];
