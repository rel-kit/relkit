/** A re-exported type is printed with its members, not as a constant of its own type. */
import { expect, test } from "bun:test";
import { expandReExports } from "../scripts/api-reexports.js";

const declaration = [
  "### ServerConfig (interface)",
  "",
  "HTTP server settings.",
  "",
  "**Signature**",
  "",
  "```ts",
  "export interface ServerConfig {",
  "  readonly port?: number;",
  "}",
  "```",
  "",
  "[Source](https://example.test/app-config.types.ts#L20)",
  "",
];
const stub = (name: string): string[] => [
  `### ${name}`,
  "",
  "**Signature**",
  "",
  "```ts",
  `declare const ${name}: ${name};`,
  "```",
  "",
  "[Source](https://example.test/define-app.types.ts#L13)",
  "",
];

test("a re-export stub takes the body of the declaration on the same page", () => {
  const page = ["## `app-config.types.ts`", "", ...declaration, "## `define-app.types.ts`", ""]
    .concat(stub("ServerConfig"), ["### defineApp", "", "Defines the application.", ""])
    .join("\n");
  const expanded = expandReExports(page);
  const second = expanded.slice(expanded.indexOf("## `define-app.types.ts`"));
  expect(second).toContain("### ServerConfig\n\nHTTP server settings.");
  expect(second).toContain("  readonly port?: number;");
  expect(second).toContain("app-config.types.ts#L20");
  expect(expanded).not.toContain("declare const ServerConfig: ServerConfig;");
  // The heading keeps its text, so links to it still work, and the next entry follows.
  expect(second).toContain("### defineApp\n\nDefines the application.");
});

test("a stub without a declaration on the page, and a real constant, stay as they are", () => {
  const constant = [
    "### DEFAULT_PORT",
    "",
    "```ts",
    "declare const DEFAULT_PORT: number;",
    "```",
    "",
  ];
  const page = ["## `define-app.types.ts`", "", ...stub("RedactionPolicy"), ...constant].join("\n");
  expect(expandReExports(page)).toBe(page);
});

test("a heading inside a code block is not an entry", () => {
  const page = ["### Example", "", "```md", "### ServerConfig (interface)", "```", ""]
    .concat(stub("ServerConfig"))
    .join("\n");
  expect(expandReExports(page)).toBe(page);
});
