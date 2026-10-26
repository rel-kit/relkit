/**
 * Checks runtime dependency direction separately from development fixtures and
 * optional peer declarations. Normal/optional installs and required peers retain
 * the existing engine/core restrictions; native implementations have finite owners.
 */
import { expect, test } from "bun:test";
import { dependencyDirectionViolations } from "../boundary-directions.js";
import type { Scope } from "../boundary-imports.js";

/**
 * Builds metadata-only scopes consumed by the real direction checker.
 * @param path - Workspace-relative owner.
 * @param manifest - Exact dependency sections under test.
 * @returns A scope with the same declared import names as repository discovery.
 */
function scope(path: string, manifest: NonNullable<Scope["manifest"]>): Scope {
  return {
    path,
    root: `/repo/${path}`,
    manifest,
    declaredDependencies: new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]),
  };
}

test("development fixtures do not install engine provider implementations", () => {
  const path = "packages/engine";
  const manifest = {
    name: "@relkit/engine",
    devDependencies: { "@relkit/providers-local": "workspace:*" },
  };
  expect(dependencyDirectionViolations("/repo", [scope(path, manifest)])).toEqual([]);
  expect(
    dependencyDirectionViolations("/repo", [
      scope(path, { ...manifest, dependencies: manifest.devDependencies }),
    ]),
  ).toMatchObject([{ rule: "engine-local-provider-dependency" }]);
});

test("core native peers must be explicitly optional instead of installed runtime edges", () => {
  const native = scope("integrations/packages/langchain", { name: "@relkit/langchain" });
  const peerDependencies = { "@relkit/langchain": "workspace:*" };
  const owner = scope("packages/runtime-hono", {
    name: "@relkit/runtime-hono",
    peerDependencies,
    peerDependenciesMeta: { "@relkit/langchain": { optional: true } },
  });
  expect(dependencyDirectionViolations("/repo", [native, owner])).toEqual([]);
  expect(
    dependencyDirectionViolations("/repo", [
      native,
      scope(owner.path, { name: owner.manifest?.name, peerDependencies }),
    ]),
  ).toMatchObject([{ rule: "core-integration-dependency" }]);
});

test("native engines own only their enumerated implementations", () => {
  const native = scope("integrations/packages/langchain", {
    name: "@relkit/langchain",
    dependencies: { "@relkit/functions": "workspace:*", "@relkit/schema": "workspace:*" },
  });
  const pulumi = scope("integrations/packages/pulumi", {
    name: "@relkit/pulumi",
    dependencies: { "@relkit/deploy-pulumi": "workspace:*" },
  });
  expect(dependencyDirectionViolations("/repo", [native, pulumi])).toEqual([]);
  const redis = scope("integrations/packages/redis", {
    name: "@relkit/redis",
    dependencies: { "@relkit/functions": "workspace:*" },
  });
  expect(dependencyDirectionViolations("/repo", [redis])).toMatchObject([
    { rule: "integration-non-protocol-dependency" },
  ]);
});
