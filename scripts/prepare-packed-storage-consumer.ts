/** Installs exact final store candidates for the existing Node-owned package tests; never packs or builds. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Effect } from "effect";
import { consumerArtifacts } from "./consumer-artifacts.js";
import { consumerRegistry } from "./consumer-registry.js";
import { consumerInstallCommand } from "./consumer-install-command.js";
import { inspectInstallation } from "./consumer-installation.js";
import { inspectionNative } from "./consumer-installation-native.js";
import { ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";

/**
 * Reuses verified candidate authority and joins installation before releasing both registry listeners.
 * @param artifacts - Mandatory existing final archive directory.
 * @param root - Package-test-owned external temporary consumer.
 * @param packages - Requested unscoped RELKIT package identities.
 * @returns Completion after a physically contained install and candidate identity audit.
 */
export const preparePackedStorageConsumer = Effect.fn("PackedStorage.prepare")(function* (
  artifacts: string,
  root: string,
  packages: readonly string[],
) {
  const repository = resolve(import.meta.dir, "..");
  const location = relative(repository, root);
  assert.ok(
    location !== "" && (isAbsolute(location) || location === ".." || location.startsWith("../")),
    "Packed storage consumer must be outside the repository",
  );
  const candidate = yield* consumerArtifacts(repository, root, artifacts);
  const dependencies = Object.fromEntries(
    packages.map((name) => {
      const identity = `@relkit/${name}`;
      assert.ok(candidate.tarballs.has(identity), `Missing exact candidate archive: ${identity}`);
      const version = candidate.manifests.get(identity)?.manifest.version;
      assert.ok(version, `Missing candidate identity: ${identity}`);
      return [identity, version];
    }),
  );
  yield* inspectionNative("packed-storage.manifest", () =>
    writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "packed-storage-consumer",
        private: true,
        type: "module",
        dependencies,
      }),
    ),
  );
  const registry = yield* consumerRegistry(root, candidate.tarballs, candidate.manifests);
  const command = yield* consumerInstallCommand(
    "bun-isolated",
    {
      name: "packed-storage-consumer",
      dependencies,
      devDependencies: {},
      // This fixture declares only runtime dependencies; normal install writes its inventory lockfile.
      production: false,
    },
    root,
    registry.url,
    join(root, "cache"),
  );
  const runner = yield* ScaffoldProcess;
  yield* runner.run({ ...command, args: [...command.args, "--ignore-scripts"] });
  const installation = yield* inspectInstallation(root);
  validatePackedStorageInstallation(installation, candidate);
  console.log(JSON.stringify({ candidate: candidate.directory, dependencies, contained: true }));
});

/**
 * Rejects foreign first-party package instances after the shared physical containment audit.
 * @param installation - Actual importer-resolved dependency closure.
 * @param candidate - Verified final archive identities.
 * @returns Nothing after every required edge and installed first-party version agrees.
 */
function validatePackedStorageInstallation(
  installation: Effect.Success<ReturnType<typeof inspectInstallation>>,
  candidate: Effect.Success<ReturnType<typeof consumerArtifacts>>,
): void {
  assert.deepEqual(installation.missing, []);
  for (const installed of installation.instances) {
    if (!installed.name.startsWith("@relkit/")) continue;
    assert.ok(
      candidate.tarballs.has(installed.name),
      `Unpacked first-party installation: ${installed.name}`,
    );
    assert.equal(installed.version, candidate.manifests.get(installed.name)?.manifest.version);
  }
}

if (import.meta.main) {
  const [artifacts, root, ...packages] = process.argv.slice(2);
  if (artifacts === undefined || root === undefined || packages.length === 0)
    throw new Error(
      "Usage: prepare-packed-storage-consumer.ts <final-candidates> <external-consumer> <package...>",
    );
  await Effect.runPromise(
    preparePackedStorageConsumer(resolve(artifacts), resolve(root), packages).pipe(
      Effect.timeout("45 seconds"),
      Effect.provide(scaffoldProcessLayer),
      Effect.scoped,
    ),
  );
}
