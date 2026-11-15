/** One key shared by the pre-paint script in layout.tsx and the shell's theme toggle. */
export const INSPECTOR_THEME_KEY = "relkit.inspector.theme";

export type InspectorTheme = "light" | "dark";

const PREFERS_LIGHT = "(prefers-color-scheme: light)";

/** A stored choice wins; until the reader chooses, the system's colour scheme decides (IN-41). */
export function resolveInspectorTheme(
  stored: string | null,
  prefersLight: boolean,
): InspectorTheme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersLight ? "light" : "dark";
}

/**
 * Runs before first paint (layout.tsx). The server renders dark; this corrects it to the stored
 * choice or the system preference, so neither theme flashes. Mirrors `resolveInspectorTheme`.
 */
export const THEME_BOOT_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(INSPECTOR_THEME_KEY)});var l=s==="light"||(s!=="dark"&&matchMedia(${JSON.stringify(PREFERS_LIGHT)}).matches);if(l){var d=document.documentElement;d.dataset.theme="light";d.classList.remove("dark")}}catch(e){}`;

function storedTheme(): string | null {
  try {
    return localStorage.getItem(INSPECTOR_THEME_KEY);
  } catch {
    return null;
  }
}

/** The theme in effect: the reader's choice, else the system's. */
export function readInspectorTheme(): InspectorTheme {
  return resolveInspectorTheme(storedTheme(), matchMedia(PREFERS_LIGHT).matches);
}

/** Applies a theme without storing it. */
export function showInspectorTheme(theme: InspectorTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Applies and remembers the reader's choice. */
export function applyInspectorTheme(theme: InspectorTheme): void {
  showInspectorTheme(theme);
  try {
    localStorage.setItem(INSPECTOR_THEME_KEY, theme);
  } catch {
    /* Storage can be unavailable (private mode); the toggle still applies for this page. */
  }
}

/**
 * Follows system colour-scheme changes until the reader chooses a theme.
 * @returns A function that stops following.
 */
export function followSystemTheme(onChange: (theme: InspectorTheme) => void): () => void {
  const query = matchMedia(PREFERS_LIGHT);
  const listener = () => {
    if (storedTheme() !== null) return;
    const theme = resolveInspectorTheme(null, query.matches);
    showInspectorTheme(theme);
    onChange(theme);
  };
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
