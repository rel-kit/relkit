import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { codeToHtml, type ThemeRegistration } from "shiki";
import { heroExampleDefinitions, type HeroExample } from "./hero-examples";

const heroTheme: ThemeRegistration = {
  name: "relkit-hero",
  type: "light",
  colors: { "editor.background": "#ffffff", "editor.foreground": "#2e2e4b" },
  tokenColors: [
    { scope: ["comment"], settings: { foreground: "#8b8b98" } },
    { scope: ["keyword", "storage"], settings: { foreground: "#b114d3" } },
    { scope: ["string"], settings: { foreground: "#0081ff" } },
    { scope: ["entity.name.function", "support.function"], settings: { foreground: "#8000ff" } },
    { scope: ["constant.numeric"], settings: { foreground: "#171717", fontStyle: "italic" } },
    { scope: ["entity.name.tag"], settings: { foreground: "#0081ff" } },
  ],
};

const heroDarkTheme: ThemeRegistration = {
  name: "relkit-hero-dark",
  type: "dark",
  colors: { "editor.background": "#0d0e10", "editor.foreground": "#e4e4ef" },
  tokenColors: [
    { scope: ["comment"], settings: { foreground: "#7c7c8a" } },
    { scope: ["keyword", "storage"], settings: { foreground: "#e08af5" } },
    { scope: ["string"], settings: { foreground: "#6cb6ff" } },
    { scope: ["entity.name.function", "support.function"], settings: { foreground: "#b799ff" } },
    { scope: ["constant.numeric"], settings: { foreground: "#f5f5f5", fontStyle: "italic" } },
    { scope: ["entity.name.tag"], settings: { foreground: "#6cb6ff" } },
  ],
};

export async function highlightHeroExamples(): Promise<readonly HeroExample[]> {
  const sourceRoot = resolve(process.cwd(), "components/landing/snippets");
  return Promise.all(
    heroExampleDefinitions.map(async (example) => ({
      ...example,
      panels: await Promise.all(
        example.panels.map(async (panel) => {
          const source = await readFile(
            resolve(/* turbopackIgnore: true */ sourceRoot, `${panel.source}.txt`),
            "utf8",
          );
          const html = await codeToHtml(source.trim(), {
            lang: "tsx",
            // Light colors are inline; the dark theme rides in --shiki-dark (see hero-examples.css).
            themes: { light: heroTheme, dark: heroDarkTheme },
            defaultColor: "light",
          });
          // Pre supplies the code surface; Shiki supplies its escaped code children.
          const highlightedCode = html.replace(/^<pre[^>]*>([\s\S]*)<\/pre>$/, "$1");
          return { ...panel, highlightedCode };
        }),
      ),
    })),
  );
}
