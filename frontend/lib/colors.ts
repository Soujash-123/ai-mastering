// Colour helpers for the palette roles in app/palettes.css.
//
// Colours in components are CSS strings such as "rgb(var(--k-accent))", so a
// palette swap needs no code change. Two places need help:
//  - alpha():  add transparency to a role colour (replaces "#rrggbb" + "40").
//  - resolve(): canvas and wavesurfer need a concrete colour, not var().

export type Role =
  | "ink" | "ink-2" | "ink-3" | "ink-soft"
  | "paper" | "paper-2" | "paper-soft" | "mid"
  | "accent" | "accent-hi" | "second"
  | "alert" | "alert-hi" | "ok" | "ok-deep";

/** CSS colour for a role, optionally with alpha. */
export const k = (role: Role, a?: number) => (a == null ? `rgb(var(--k-${role}))` : `rgb(var(--k-${role}) / ${a})`);

/** Add alpha to a colour produced by k(); other colours are returned as is. */
export function alpha(color: string, a: number): string {
  const m = color.match(/^rgb\(var\((--k-[a-z0-9-]+)\)(?:\s*\/\s*[0-9.]+)?\)$/);
  return m ? `rgb(var(${m[1]}) / ${a})` : color;
}

/** Turn a k() colour into a concrete rgb()/rgba() string using the live palette. */
export function resolve(color: string): string {
  if (typeof window === "undefined") return color;
  const style = getComputedStyle(document.documentElement);
  return color.replace(/rgb\(var\((--k-[a-z0-9-]+)\)(?:\s*\/\s*([0-9.]+))?\)/g, (_, v: string, a?: string) => {
    const rgb = style.getPropertyValue(v).trim().split(/\s+/).join(",");
    return a != null ? `rgba(${rgb},${a})` : `rgb(${rgb})`;
  });
}
