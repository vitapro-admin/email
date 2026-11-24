/**
 * Turns what a person types into a safe link target, or null when it is not a usable address.
 * Only http, https, mailto and tel are ever allowed (the server enforces the same rule).
 */
export function normalizeLink(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return `mailto:${value}`;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value)) return `https://${value}`;
  return null;
}
