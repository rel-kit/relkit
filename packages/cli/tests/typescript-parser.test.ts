/**
 * The CLI parses and scans source with its own TypeScript 5.9 compiler API, so the application's
 * TypeScript (5.9, or 7, whose package has no JavaScript compiler API) never constrains codemods,
 * scaffolding or source scanning. Every source module reaches that API through
 * `src/typescript-parser.ts`, and the published package bundles it rather than installing a
 * second `typescript` package beside the application's.
 */
import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import ts from "../src/typescript-parser.js";
import { codeSyntax, parseCodeSource } from "../src/migration/code-parser.js";

const cli = resolve(import.meta.dir, "..");

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return Promise.resolve(entry.name.endsWith(".ts") ? [path] : []);
    }),
  );
  return nested.flat();
}

test("the private parser is TypeScript 5.9 with its compiler API", () => {
  expect(ts.versionMajorMinor).toBe("5.9");
  expect(typeof ts.createProgram).toBe("function");
  const source = parseCodeSource("src/a.ts", "export const a: number = 1;\n");
  expect(codeSyntax.isVariableStatement(source.statements[0]!)).toBe(true);
});

test("CLI sources import the compiler API only through the private parser", async () => {
  const offenders: string[] = [];
  for (const file of await sourceFiles(join(cli, "src"))) {
    const text = await readFile(file, "utf8");
    if (/from "typescript"|import\("typescript"\)|require\("typescript"\)/.test(text))
      offenders.push(file.slice(cli.length + 1));
    if (text.includes('"relkit-typescript"') && !file.endsWith("/src/typescript-parser.ts"))
      offenders.push(file.slice(cli.length + 1));
  }
  expect(offenders).toEqual([]);
});

test("the published CLI bundles the parser instead of depending on typescript", async () => {
  const manifest = JSON.parse(await readFile(join(cli, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  expect(Object.keys(manifest.dependencies)).not.toContain("typescript");
  expect(Object.keys(manifest.dependencies)).not.toContain("relkit-typescript");
  expect(manifest.devDependencies["relkit-typescript"]).toBe("workspace:*");
  expect(manifest.scripts.build).toContain("package-typescript-parser.ts");
});
