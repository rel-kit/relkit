/** Verifies packing closure includes every source workspace declaration without changing runtime selection. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { dependencyFields } from "../../scripts/catalog-manifest.ts";
import { packingWorkspaceClosure } from "../../scripts/packing-workspace-closure.ts";
import { readManifests } from "../../scripts/pack-and-smoke-create-relkit-pack.ts";

test("readiness packing retains isolated optional and development workspace owners", async () => {
  const manifests = await readManifests(resolve(import.meta.dir, "../.."));
  const names = packingWorkspaceClosure(["@relkit/cli", "@relkit/testing"], manifests);
  for (const name of [
    "@relkit/langchain",
    "@relkit/better-auth",
    "@relkit/drizzle",
    "@relkit/deploy-pulumi",
  ])
    expect(names).toContain(name);
  for (const name of names)
    for (const field of dependencyFields)
      for (const [dependency, spec] of Object.entries(manifests.get(name)!.manifest[field] ?? {}))
        if (String(spec).startsWith("workspace:")) expect(names).toContain(dependency);
  expect(new Set(names).size).toBe(names.length);
});

test("packing never replaces a missing workspace owner with a registry package", () => {
  const manifests = new Map([
    ["root", { manifest: { devDependencies: { missing: "workspace:*" } } }],
  ]);
  expect(() => packingWorkspaceClosure(["root"], manifests)).toThrow(
    "Missing workspace package missing",
  );
});
