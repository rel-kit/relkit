/** Materializes the outside-workspace public resolver fixture and invokes its scoped native Node and Bun verifiers. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import {
  smokeMinimalIntegrationInstalls,
  unpackTarball,
} from "./pack-and-smoke-integration-minimal.js";
import { exportNative } from "./pack-export-native.js";
import type { ExportCommand, ExportInventory } from "./pack-export.types.js";
import { makeExportInstaller } from "./pack-export-install.js";
import { assertProductionFootprint, developmentPackages } from "./packed-footprint.js";

/** The integration installed next to `relkit` in the production footprint check. */
const footprintIntegration = "@relkit/redis";

/**
 * Validates isolated integration installs and a production install's footprint, then resolves all
 * intentional public entrypoints.
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
  const install = yield* makeExportInstaller(run, temporary, repository, tarballs);
  const count = yield* exportNative("minimal.install", () =>
    smokeMinimalIntegrationInstalls(
      join(temporary, "minimal"),
      repository,
      [...inventory.directories],
      inventory.integrationNames,
      inventory.manifests,
      tarballs,
      (root, names) => Effect.runPromise(install(root, names)),
    ),
  );
  console.log(
    `Minimal integration installs passed: ${count - Number(inventory.integrationNames.has("@relkit/langchain"))} authoring entries loaded without selected SDKs; ${count} integrations' public entries loaded with declared peers and without unrelated integrations.`,
  );
  const footprint = join(temporary, "footprint");
  yield* install(footprint, ["relkit", footprintIntegration], true);
  const installed = yield* exportNative("footprint.scan", () =>
    assertProductionFootprint(footprint),
  );
  console.log(
    `Production footprint passed: relkit and ${footprintIntegration} install ${installed.length} packages, none of ${developmentPackages.join(", ")}.`,
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
  yield* install(fixture, [...inventory.requiredNames]);
  const output = yield* run({ executable: "node", args: ["resolve.mjs"], cwd: fixture });
  process.stdout.write(output);
  process.stdout.write(yield* run({ args: ["resolve.mjs", "--bun-only"], cwd: fixture }));
});
