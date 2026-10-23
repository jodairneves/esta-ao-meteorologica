/** Joins class names, skipping falsy entries. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Current value of a CSS custom property on <html> (theme-aware). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A comma-separated custom property (ramps, series order) as an array. */
export function cssList(name: string): string[] {
  return cssVar(name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
