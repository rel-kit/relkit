/** The Inspector API reference lists every registered endpoint with its version and authentication. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { INSPECTOR_API_PATHS, inspectorApiReference } from "relkit/inspector-api";
import { INSPECTION_BRIDGE_ENDPOINTS } from "relkit/inspector-api/connection";

const page = await readFile(
  resolve(import.meta.dir, "../content/docs/api/inspector-protocol.mdx"),
  "utf8",
);
const endpoints = await inspectorApiReference();
const rows = page
  .split("\n")
  .map((line) => line.split("|").map((cell) => cell.trim()))
  .filter((cells) => /^(GET|POST|PUT|PATCH|DELETE)$/u.test(cells[1] ?? ""));

test("the reference covers every advertised path and every bridge endpoint", () => {
  const documented = new Set(endpoints.map((endpoint) => endpoint.path));
  for (const path of INSPECTOR_API_PATHS) expect(documented.has(path)).toBe(true);
  for (const { path } of INSPECTION_BRIDGE_ENDPOINTS) expect(documented.has(path)).toBe(true);
});

test("the committed page has one row per endpoint with its version and authentication", () => {
  expect(rows).toHaveLength(endpoints.length);
  for (const endpoint of endpoints) {
    const cells = rows.find(
      (row) => row[1] === endpoint.method && row[2] === `\`${endpoint.path}\``,
    );
    expect(cells, `${endpoint.method} ${endpoint.path}`).toBeDefined();
    expect(cells![3]).toBe(endpoint.version);
    expect(cells![5]).toMatch(/^\[\d+\]$/u);
    expect(endpoint.authentication.length).toBeGreaterThan(20);
  }
});

test("mutating endpoints are documented with their methods", () => {
  const methods = new Set(endpoints.map((endpoint) => endpoint.method));
  expect([...methods].sort()).toEqual(expect.arrayContaining(["GET", "POST"]));
  expect(
    endpoints.some((endpoint) => endpoint.path.endsWith("/actions/functions/:id/invoke")),
  ).toBe(true);
});
