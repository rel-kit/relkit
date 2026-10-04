import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PackageManifest } from "./frontend-dependency-closure.types.js";

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const nativeAgentPackage = /^(?:langchain|deepagents|@langchain\/)/;

test("frontend client dependency closure excludes native agent runtimes", async () => {
  const manifests = await workspaceManifests();
  const closure = dependencyClosure("@relkit/client", manifests);

  expect(closure.has("@relkit/agents")).toBe(false);
  expect([...closure].filter((name) => nativeAgentPackage.test(name))).toEqual([]);
});

/**
 * Loads authored workspace manifests for dependency-boundary assertions.
 * @returns Workspace package names mapped to their declared manifests.
 */
async function workspaceManifests(): Promise<ReadonlyMap<string, PackageManifest>> {
  const files = [
    ...new Bun.Glob("packages/*/package.json").scanSync(repositoryRoot),
    ...new Bun.Glob("integrations/catalog/package.json").scanSync(repositoryRoot),
    ...new Bun.Glob("integrations/packages/*/package.json").scanSync(repositoryRoot),
  ];
  const manifests = await Promise.all(
    files.map(async (file) => {
      const value = JSON.parse(
        await readFile(resolve(repositoryRoot, file), "utf8"),
      ) as PackageManifest;
      return [value.name, value] as const;
    }),
  );
  return new Map(manifests);
}

/**
 * Traverses workspace dependencies reachable from one browser entry package.
 * @param root - Workspace package whose browser dependency closure is inspected.
 * @param manifests - Authored workspace manifests indexed by package name.
 * @returns The complete reachable workspace package set.
 */
function dependencyClosure(
  root: string,
  manifests: ReadonlyMap<string, PackageManifest>,
): ReadonlySet<string> {
  const closure = new Set<string>();
  const pending = [root];
  while (pending.length > 0) {
    const name = pending.shift()!;
    if (closure.has(name)) continue;
    closure.add(name);
    pending.push(...Object.keys(manifests.get(name)?.dependencies ?? {}));
  }
  return closure;
}
