const GENERIC_FONT_FAMILIES = new Set([
  "cursive",
  "fantasy",
  "monospace",
  "sans-serif",
  "serif",
  "system-ui",
]);

export function fontFamilyToCss(fontFamily: string): string {
  const normalized = fontFamily.trim();
  if (!normalized) return "";
  if (GENERIC_FONT_FAMILIES.has(normalized.toLowerCase())) {
    return normalized.toLowerCase();
  }

  const escaped = normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function fontStackToCss(
  fontStack: readonly string[],
  fallback: string
): string {
  const families = fontStack.map(fontFamilyToCss).filter(Boolean);
  const fallbackFamily = fontFamilyToCss(fallback);

  if (families.length === 0) return fallbackFamily;

  const lastFamily = families[families.length - 1].toLowerCase();
  if (GENERIC_FONT_FAMILIES.has(lastFamily)) {
    return families.join(", ");
  }

  return [...families, fallbackFamily].join(", ");
}
