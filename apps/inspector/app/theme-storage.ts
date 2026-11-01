/** One key shared by the pre-paint script in layout.tsx and the shell's theme toggle. */
export const INSPECTOR_THEME_KEY = "relkit.inspector.theme";

export type InspectorTheme = "light" | "dark";

/** Dark is the default; only an explicit stored "light" switches it. */
export function readInspectorTheme(): InspectorTheme {
  try {
    return localStorage.getItem(INSPECTOR_THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyInspectorTheme(theme: InspectorTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(INSPECTOR_THEME_KEY, theme);
  } catch {
    /* Storage can be unavailable (private mode); the toggle still applies for this page. */
  }
}
