import { describe, expect, test } from "bun:test";
import { THEME_BOOT_SCRIPT, resolveInspectorTheme } from "../app/theme-storage";

describe("theme resolution (IN-41)", () => {
  test("a stored choice wins", () => {
    expect(resolveInspectorTheme("light", false)).toBe("light");
    expect(resolveInspectorTheme("dark", true)).toBe("dark");
  });

  test("without a choice it follows the system", () => {
    expect(resolveInspectorTheme(null, true)).toBe("light");
    expect(resolveInspectorTheme(null, false)).toBe("dark");
    expect(resolveInspectorTheme("unknown", true)).toBe("light");
  });
});

function boot(stored: string | null, prefersLight: boolean) {
  const classes = new Set(["dark"]);
  const root = {
    dataset: { theme: "dark" } as Record<string, string>,
    classList: {
      remove: (name: string) => classes.delete(name),
      toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
    },
  };
  const run = new Function("document", "localStorage", "matchMedia", THEME_BOOT_SCRIPT);
  run({ documentElement: root }, { getItem: () => stored }, (query: string) => ({
    matches: query === "(prefers-color-scheme: light)" && prefersLight,
  }));
  return { theme: root.dataset.theme, dark: classes.has("dark") };
}

describe("boot script", () => {
  test("applies the system's light preference before paint", () => {
    expect(boot(null, true)).toEqual({ theme: "light", dark: false });
  });

  test("keeps dark for a dark system or a stored dark choice", () => {
    expect(boot(null, false)).toEqual({ theme: "dark", dark: true });
    expect(boot("dark", true)).toEqual({ theme: "dark", dark: true });
  });

  test("applies a stored light choice", () => {
    expect(boot("light", false)).toEqual({ theme: "light", dark: false });
  });
});
