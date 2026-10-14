/** Materializes the outside-workspace public resolver fixture and invokes only its scoped native Node verifier. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import {
  copyExternalDependencies,
  smokeMinimalIntegrationInstalls,
  unpackTarball,
} from "./pack-and-smoke-integration-minimal.js";
import { exportNative } from "./pack-export-native.js";
import type { ExportCommand, ExportInventory } from "./pack-export.types.js";

/**
 * Validates isolated integration installs and then resolves all intentional public entrypoints.
 * @param run - Captured child-group owner.
 * @param temporary - Scope-owned fixture parent.
 * @param repository - Read-only installed native dependency authority.
 * @param inventory - Exact first-party manifest closure.
 * @param tarballs - Exact required artifact identities.
 * @returns Completion after the native resolver exits and output is drained.
 */
export const verifyExportFixture = Effect.fn("ExportSmoke.verify")(function* (
  run: ExportCommand,
  temporary: string,
  repository: string,
  inventory: ExportInventory,
  tarballs: Map<string, string>,
) {
  const count = yield* exportNative("minimal.install", () =>
    smokeMinimalIntegrationInstalls(
      join(temporary, "minimal"),
      repository,
      [...inventory.directories],
      inventory.integrationNames,
      inventory.manifests,
      tarballs,
    ),
  );
  console.log(
    `Minimal integration installs passed: ${count} packages loaded without unrelated integrations or SDKs.`,
  );
  const fixture = join(temporary, "fixture");
  for (const [name, tarball] of tarballs)
    yield* exportNative("artifact.unpack", () =>
      unpackTarball(tarball, join(fixture, "node_modules", ...name.split("/"))),
    );
  const exports = Object.fromEntries(
    [...inventory.requiredNames]
      .sort()
      .map((name) => [name, inventory.manifests.get(name)?.exports]),
  );
  yield* exportNative("fixture.exports", () =>
    writeFile(join(fixture, "expected-exports.json"), JSON.stringify(exports)),
  );
  const external = new Set<string>();
  for (const name of inventory.requiredNames)
    for (const dependency of Object.keys(inventory.manifests.get(name)?.dependencies ?? {}))
      if (!inventory.manifests.has(dependency)) external.add(dependency);
  yield* exportNative("fixture.dependencies", () =>
    copyExternalDependencies(fixture, external, repository, [...inventory.directories]),
  );
  const output = yield* run({ executable: "node", args: ["resolve.mjs"], cwd: fixture });
  process.stdout.write(output);
});
