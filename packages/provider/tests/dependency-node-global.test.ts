/** A fresh native Node process rejects NODE_PATH packages while retaining real ancestor node_modules resolution. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/** Writes metadata whose executable throws, proving the resolver only reads manifests. */
function dependency(directory: string) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name: "fixture-node-sdk",
      version: "1.0.0",
      type: "module",
      exports: "./index.js",
    }),
  );
  writeFileSync(join(directory, "index.js"), 'throw new Error("SDK must never evaluate");');
}

/** Starts actual Node with child-local NODE_PATH; parent environment and globals are untouched. */
function inspect(root: string, global: string) {
  const provider = pathToFileURL(
    fileURLToPath(new URL("../dist/dependency-source.service.js", import.meta.url)),
  ).href;
  const effect = import.meta.resolve("effect");
  const source = `
import { Effect } from ${JSON.stringify(effect)};
import { DependencySource } from ${JSON.stringify(provider)};
const source = await Effect.runPromise(DependencySource.make);
console.log(JSON.stringify(await Effect.runPromise(source.resolve("fixture-node-sdk", ${JSON.stringify(root)}))));
`;
  const result = spawnSync(
    "node",
    ["--max-old-space-size=256", "--input-type=module", "-e", source],
    {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, NODE_PATH: global },
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

test("fresh Node ignores global NODE_PATH but resolves the adapter ancestry", () => {
  const directory = mkdtempSync(join(tmpdir(), "relkit-node-dependency-search-"));
  const root = join(directory, "project", "nested", "adapter");
  const global = join(directory, "foreign-global", "node_modules");
  mkdirSync(root, { recursive: true });
  dependency(join(global, "fixture-node-sdk"));
  try {
    expect(inspect(root, global)).toBeNull();
    dependency(join(directory, "project", "node_modules", "fixture-node-sdk"));
    expect(inspect(root, global)).toMatchObject({
      name: "fixture-node-sdk",
      version: "1.0.0",
    });
    rmSync(directory, { recursive: true, force: true });
  } catch (cause) {
    writeFileSync(join(directory, "failure.txt"), String(cause));
    throw cause;
  }
});
