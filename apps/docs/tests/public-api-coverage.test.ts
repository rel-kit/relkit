/** Checks that export coverage follows real imports and preserves duplicate native anchor identities. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { contractIndex, missingContracts } from "../scripts/public-api-contracts.js";
import { exportSource } from "../scripts/public-api-manifests.js";
import { cleanDocgen } from "../scripts/generate-api.js";
import { publicApiInventory } from "../scripts/public-api-inventory.js";
import type { PublicImport } from "../scripts/public-api.types.js";

test("indexes duplicate native names by declaration, ignoring code-fence headings", () => {
  const body = [
    "## first.ts",
    "### defineThing",
    "**Example**",
    "```ts",
    "### not a heading",
    "```",
    "[Source](https://github.com/rel-kit/relkit/blob/main/packages/first/src/thing.ts#L1)",
    "## legacy.ts",
    "### defineThing",
    "[Source](https://github.com/rel-kit/relkit/blob/main/packages/first/src/legacy.ts#L5)",
  ].join("\n");
  const contracts = contractIndex(new Map([["first", body]]));
  expect(contracts.get("packages/first/src/thing.ts:defineThing")).toEqual({
    href: "/docs/api/first#definething",
    example: true,
  });
  expect(contracts.get("packages/first/src/legacy.ts:defineThing")?.href).toBe(
    "/docs/api/first#definething-1",
  );
  const entry: PublicImport = {
    packageName: "@relkit/first",
    description: "Test",
    directory: "packages/first",
    specifier: "@relkit/first/legacy",
    source: "packages/first/src/index.ts",
    internal: false,
    symbols: [
      {
        name: "renamed",
        original: "defineThing",
        source: "packages/first/src/legacy.ts",
        line: 5,
        description: "Legacy",
        examples: [],
        value: true,
      },
    ],
  };
  expect(missingContracts([entry], contracts)).toEqual([]);
  expect(
    missingContracts(
      [{ ...entry, symbols: [{ ...entry.symbols[0]!, original: "newUndocumentedApi" }] }],
      contracts,
    ),
  ).toHaveLength(1);
  expect(missingContracts([{ ...entry, internal: true }], new Map())).toEqual([]);
});

test("finds React TSX and explicit source targets, and fails on unresolved manifest exports", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "relkit-docs-exports-"));
  try {
    await writeFile(resolve(directory, "context.tsx"), "export const Context = () => null;\n");
    expect(exportSource(directory, "./context.d.ts")).toBe(resolve(directory, "context.tsx"));
    await writeFile(resolve(directory, "catalog.ts"), "export const catalog = {};\n");
    expect(exportSource(directory, "./catalog.ts")).toBe(resolve(directory, "catalog.ts"));
    expect(() => exportSource(directory, "./missing.d.ts")).toThrow("No documentation source");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps the nested source location for React and integration runtime APIs", () => {
  const source =
    "## context.tsx overview\n\n## RelkitClientProvider\n\n[Source](https://github.com/rel-kit/relkit/blob/main/packages/client/src/context.tsx#L12)";
  const markdown = cleanDocgen(source, "react/context.tsx");
  expect(markdown).toContain("## `context.tsx`");
  expect(markdown).toContain("packages/client/src/react/context.tsx#L12");
  expect(
    contractIndex(new Map([["client", markdown]])).has(
      "packages/client/src/react/context.tsx:RelkitClientProvider",
    ),
  ).toBe(true);
});

test("audits actual star exports, aliases, types, named defaults and JSX beyond the feature catalog", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "relkit-docs-inventory-"));
  const directory = resolve(root, "packages/cli");
  try {
    await writeInventoryFixture(directory);
    const entries = publicApiInventory(root);
    const entry = entries.find(({ internal }) => !internal)!;
    expect(entry.symbols.map(({ name }) => name)).toEqual([
      "create",
      "default",
      "Options",
      "renamed",
    ]);
    expect(entry.symbols.find(({ name }) => name === "renamed")?.original).toBe("create");
    expect(entry.symbols.find(({ name }) => name === "default")?.original).toBe("initialize");
    expect(entry.symbols.find(({ name }) => name === "create")?.source).toEndWith("context.tsx");
    expect(entry.symbols.find(({ name }) => name === "renamed")?.exampleSource).toBe(
      "packages/cli/tests/usage.ts#L2",
    );
    expect(entries.find(({ internal }) => internal)?.symbols).toEqual([]);
    await writeFile(
      resolve(directory, "package.json"),
      JSON.stringify({
        name: "@relkit/new-public-package",
        description: "Public tooling",
        exports: { ".": { types: "./dist/index.d.ts" } },
      }),
    );
    expect(() => publicApiInventory(root)).toThrow("Public package has no reference");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** Creates a package with aliases, JSX, a named default, and an imported usage.
 * @param directory - Owned fixture package. @returns Completion after its sources exist. */
async function writeInventoryFixture(directory: string): Promise<void> {
  await mkdir(resolve(directory, "src"), { recursive: true });
  await writeFile(
    resolve(directory, "package.json"),
    JSON.stringify({
      name: "@relkit/cli",
      description: "Public tooling",
      exports: {
        ".": { types: "./dist/index.d.ts" },
        "./internal": { types: "./dist/index.d.ts" },
      },
    }),
  );
  await writeFile(
    resolve(directory, "src/index.ts"),
    'export * from "./context.js"; export { create as renamed } from "./context.js"; export default function initialize() { return 1; }\n',
  );
  await writeFile(
    resolve(directory, "src/context.tsx"),
    "export type Options = { label: string }; export function create() { return null; }\n",
  );
  await mkdir(resolve(directory, "tests"));
  await writeFile(
    resolve(directory, "tests/usage.ts"),
    'import { create as build } from "../src/context.js";\nbuild();\n',
  );
}
