import { classifySecretPlaceholder, sanitizeInputValue, type FieldSignals } from "@ghost/security";

export function fieldSignals(element: Element): FieldSignals {
  const input = element as HTMLInputElement;
  const id = input.id;

  let label: string | undefined;
  if (id) {
    const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    label = forLabel?.textContent ?? undefined;
  }
  if (!label) {
    const wrappingLabel = input.closest("label");
    label = wrappingLabel?.textContent ?? undefined;
  }
  const signals: FieldSignals = {
    type: input.type,
    autocomplete: input.autocomplete,
    name: input.name,
    id,
    placeholder: input.placeholder
  };
  const ariaLabel = input.getAttribute("aria-label");
  if (label) signals.label = label;
  if (ariaLabel) signals.ariaLabel = ariaLabel;
  return signals;
}

export function safeInputPayload(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const signals = fieldSignals(element);
  const value = "value" in element ? element.value : "";
  return sanitizeInputValue(value, signals) ?? { value_placeholder: classifySecretPlaceholder(signals) };
}
