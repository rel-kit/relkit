/** Retains original whitespace assertions for project-discovery, registered by the owning suite. */
import { expect } from "bun:test";
import { addSourceExport } from "../../packages/cli/src/scaffolding/index.ts";
export function case1Whitespace() {
  const source = `  export const items = ${" ".repeat(100_000)}{};`;
  const declaration = `export * from "./auth.js";`;
  const result = addSourceExport(`${source}\t\r\n\u00a0\ufeff`, "schema.ts", declaration);
  expect(result).toBe(`${source}\n${declaration}\n`);
  expect(addSourceExport(result, "schema.ts", declaration)).toBe(result);
}
