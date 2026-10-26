/** Checks actual first-party manifest ownership against the installed oRPC declaration graph. Required host API peers cover separately installed query SDK contexts; frontend, OpenAPI UI and telemetry SDK packages remain optional selections. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Effect } from "effect";
import { readConsumerManifest } from "../consumer-installation-native.js";
import { workspacePackageDirectories } from "../workspace-packages.js";

const root = resolve(import.meta.dir, "../..");
const api = "@opentelemetry/api";

/** Reads only installed oRPC package metadata from each actual importer context.
 * @param directory - Native selected query package root.
 * @returns The native transitive oRPC closure, without evaluating package code.
 */
async function orpcClosure(directory: string) {
  const pending = [directory];
  const packages = new Map<string, string>();
  for (const current of pending) {
    const manifest = await Effect.runPromise(readConsumerManifest(current));
    if (packages.has(manifest.name)) continue;
    packages.set(manifest.name, current);
    const require = createRequire(join(current, "package.json"));
    for (const name of Object.keys(manifest.dependencies ?? {}))
      if (name.startsWith("@orpc/")) pending.push(dirname(require.resolve(`${name}/package.json`)));
  }
  return packages;
}

test("every direct first-party oRPC runtime owner declares its required API", async () => {
  const directories = [
    ...workspacePackageDirectories(root),
    ...[...new Bun.Glob("apps/*/package.json").scanSync({ cwd: root })].map((file) =>
      dirname(join(root, file)),
    ),
  ];
  const owners: string[] = [];
  for (const directory of directories) {
    const manifest = await Effect.runPromise(readConsumerManifest(directory));
    if (!Object.keys(manifest.dependencies ?? {}).some((name) => name.startsWith("@orpc/")))
      continue;
    owners.push(manifest.name);
    const version = manifest.dependencies?.[api] ?? manifest.peerDependencies?.[api];
    expect(version).toBe("1.9.1");
    expect(manifest.peerDependenciesMeta?.[api]?.optional).not.toBe(true);
  }
  expect(owners.sort()).toEqual(["@relkit/client", "@relkit/inspector", "@relkit/runtime-hono"]);
});

test("client exposes a required host API peer while frontend SDK peers remain optional", async () => {
  const client = await Effect.runPromise(readConsumerManifest(join(root, "packages/client")));
  expect(client.peerDependencies?.[api]).toBe("1.9.1");
  expect(client.devDependencies?.[api]).toBe("1.9.1");
  expect(client.peerDependenciesMeta?.[api]?.optional).not.toBe(true);
  for (const name of [
    "@orpc/tanstack-query",
    "@tanstack/query-core",
    "@tanstack/react-query",
    "react",
  ]) {
    expect(client.dependencies?.[name]).toBeUndefined();
    expect(client.peerDependenciesMeta?.[name]?.optional).toBe(true);
  }
});

test("actual selected query dependency closure includes the unconditional API declaration", async () => {
  const require = createRequire(join(root, "packages/client/package.json"));
  const query = dirname(require.resolve("@orpc/tanstack-query/package.json"));
  const packages = await orpcClosure(query);
  expect([...packages.keys()].sort()).toEqual([
    "@orpc/client",
    "@orpc/contract",
    "@orpc/json-schema",
    "@orpc/openapi",
    "@orpc/server",
    "@orpc/shared",
    "@orpc/tanstack-query",
  ]);
  const shared = packages.get("@orpc/shared");
  if (shared === undefined) throw new Error("Native oRPC shared dependency is absent");
  const manifest = await Effect.runPromise(readConsumerManifest(shared));
  expect(manifest.peerDependencies?.[api]).toBe(">=1.9.0");
  expect(manifest.peerDependenciesMeta?.[api]?.optional).toBe(true);
  const declaration = await readFile(join(shared, "dist/index.d.mts"), "utf8");
  expect(declaration).toMatch(/\bfrom\s+["']@opentelemetry\/api["']/);
});
