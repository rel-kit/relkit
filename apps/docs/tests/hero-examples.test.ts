import { expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { highlightHeroExamples } from "../components/landing/highlight-hero-examples";
import { heroExampleDefinitions } from "../components/landing/hero-examples";
import ts from "typescript";

test("hero examples render all design states as escaped, highlighted code", async () => {
  const examples = await highlightHeroExamples();
  expect(examples).toHaveLength(14);
  expect(examples.flatMap((example) => example.panels)).toHaveLength(27);
  const routes = examples[0]!;
  expect(routes.title).toBe("Routes");
  expect(routes.panels.map((panel) => panel.label)).toEqual(["Backend", "Frontend"]);
  expect(routes.panels[1]!.highlightedCode).toMatch(/&lt;|&#x3C;/);
  expect(routes.panels[1]!.highlightedCode).not.toContain("<main>");
  for (const example of examples) {
    await access(resolve("content", `${example.guide.slice(1)}.mdx`));
    for (const panel of example.panels) {
      if (panel.guide) await access(resolve("content", `${panel.guide.slice(1)}.mdx`));
      expect(panel.highlightedCode).toStartWith("<code");
      expect(panel.highlightedCode).not.toContain("<pre");
      expect(panel.highlightedCode).toContain("style=");
      expect(panel.highlightedCode).not.toContain("hero-code-setup");
    }
  }
});

test("hero excerpts omit framework imports and remain valid TSX", async () => {
  for (const panel of heroExampleDefinitions.flatMap((example) => [...example.panels])) {
    const source = await readFile(
      resolve("components/landing/snippets", `${panel.source}.txt`),
      "utf8",
    );
    const parsed = ts.createSourceFile(`${panel.source}.tsx`, source, ts.ScriptTarget.ESNext);
    for (const statement of parsed.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        expect(statement.moduleSpecifier.text).not.toStartWith("@relkit/");
      }
    }
    const compiled = ts.transpileModule(source, {
      fileName: `${panel.source}.tsx`,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ESNext },
    });
    expect(compiled.diagnostics).toEqual([]);
  }
});
