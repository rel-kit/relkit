/** Checks that published snippets cannot silently drift from their declared source regions. */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateSourceSnippets,
  sourceIncludes,
  sourceRegion,
} from "../scripts/source-snippets.js";

test("extracts one complete named region and preserves its code", () => {
  expect(
    sourceRegion("before\n// #region setup\nconst a = 1;\n// #endregion setup\nafter", "setup"),
  ).toBe("const a = 1;\n");
  expect(() => sourceRegion("const a = 1;", "setup")).toThrow("setup");
  expect(() => sourceRegion("// #region setup\nconst a = 1;", "setup")).toThrow("setup");
  expect(() =>
    sourceRegion(
      "// #region setup\na\n// #endregion setup\n// #region setup\nb\n// #endregion setup",
      "setup",
    ),
  ).toThrow("setup");
});

test("ignores include examples inside native Markdown fences", () => {
  const include = '<include source="example.ts">/_snippets/source/example.ts</include>';
  expect(sourceIncludes(`~~~~md\n${include}\n\x60\x60\x60\n${include}\n~~~~\n${include}`)).toEqual([
    { source: "example.ts", output: "/_snippets/source/example.ts" },
  ]);
});

test("materializes one owned copy and rejects missing or conflicting sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-docs-includes-"));
  const page = join(root, "page.mdx");
  const output = new Map<string, string>();
  const emit = async (path: string, value: string) => {
    output.set(path, value);
  };
  const include = '<include source="example.ts#demo">/_snippets/source/example--demo.ts</include>';
  try {
    await writeFile(
      join(root, "example.ts"),
      "// #region demo\nconst value = 1;\n// #endregion demo\n",
    );
    await writeFile(page, `${include}\n${include}`);
    await generateSourceSnippets(root, [page], emit);
    expect([...output]).toEqual([["_snippets/source/example--demo.ts", "const value = 1;\n"]]);
    await writeFile(page, include.replace("example.ts#demo", "missing.ts"));
    await expect(generateSourceSnippets(root, [page], emit)).rejects.toThrow();
    await writeFile(page, `${include}\n${include.replace("example.ts#demo", "another.ts")}`);
    await expect(generateSourceSnippets(root, [page], emit)).rejects.toThrow("Conflicting");
    await writeFile(page, include.replace("/_snippets/source/", "/../"));
    await expect(generateSourceSnippets(root, [page], emit)).rejects.toThrow("Invalid snippet");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
