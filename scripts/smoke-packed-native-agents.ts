/** Runs retained selected-agent scenarios against fresh candidate tarballs through the existing external consumer registry and installer. */
import { strict as assert } from "node:assert";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { consumerArtifacts } from "./consumer-artifacts.js";
import { consumerRegistry } from "./consumer-registry.js";
import { consumerInstallCommand } from "./consumer-install-command.js";
import { inspectInstallation } from "./consumer-installation.js";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import { PackedTypeCatalog } from "./consumer-packed-type.schemas.js";
import { compileNativePublicTypes, prepareNativeFixture } from "./consumer-native-agent-fixture.js";
import { ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";

const repository = resolve(import.meta.dir, "..");
const nativePackages = ["@langchain/core", "@langchain/langgraph", "langchain", "langsmith"];
const firstParty = ["@relkit/langchain", "@relkit/schema", "@relkit/testing"];

/** Installs one isolated external cohort and retains its sources, lockfile and observed closure. */
export const smokePackedNativeAgents = Effect.fn("PackedNativeAgents.smoke")(function* (
  artifacts: string,
  output: string,
) {
  const { root, registry, dependencies, devDependencies } = yield* packedNativeContext(
    artifacts,
    output,
  );
  const runner = yield* ScaffoldProcess;
  const fixture = { name: "native-agents", dependencies, devDependencies, production: false };
  const install = yield* consumerInstallCommand(
    "bun-isolated",
    fixture,
    root,
    registry.url,
    join(output, "cache"),
  );
  const installationLog = yield* runner.run(install);
  const installation = yield* inspectInstallation(root, { development: true });
  yield* inspectionNative("inventory.write", () =>
    writeFile(join(output, "installation.json"), JSON.stringify(installation, null, 2)),
  );
  const physicalCounts = yield* inspectionNative("closure.validate", async () =>
    validateNativeClosure(installation, dependencies, await realpath(root)),
  );
  const typing = yield* compileNativePublicTypes(root);
  const behavior = yield* runner.run({
    cwd: root,
    args: [
      "test",
      "--timeout",
      "10000",
      "--max-concurrency",
      "1",
      "./behavior.test.ts",
      "./graph-interrupt-start.test.ts",
      "./native-todo.test.ts",
    ],
  });
  const report = {
    dependencies,
    devDependencies,
    installation,
    physicalCounts,
    installationLog,
    typing,
    behavior,
  };
  yield* inspectionNative("report.write", () =>
    writeFile(join(output, "report.json"), JSON.stringify(report, null, 2)),
  );
  return { root, dependencies, devDependencies, installation, typing, behavior };
});

/** Acquires candidate metadata and a scope-owned registry before writing the external fixture. */
const packedNativeContext = Effect.fn("PackedNativeAgents.context")(function* (
  artifacts: string,
  output: string,
) {
  const location = relative(repository, output);
  if (
    location === "" ||
    (!isAbsolute(location) && location !== ".." && !location.startsWith("../"))
  )
    return yield* consumerInputFailure(
      "packed-native.output",
      "Output must be outside the repository",
    );
  yield* inspectionNative("output.create", () => mkdir(output, { recursive: true }));
  const candidate = yield* consumerArtifacts(repository, output, artifacts);
  const registry = yield* consumerRegistry(output, candidate.tarballs, candidate.manifests);
  const creator = candidate.manifests.get("create-relkit")?.manifest;
  if (creator === undefined)
    return yield* consumerInputFailure("packed-native.creator", "Missing creator metadata");
  const catalog = yield* Schema.decodeUnknownEffect(PackedTypeCatalog)(creator.relkit);
  const dependencies = Object.fromEntries(
    [...firstParty, ...nativePackages].map((name) => {
      const version =
        candidate.manifests.get(name)?.manifest.version ?? catalog.buildCatalog.dependencies[name];
      assert.ok(version, `Missing selected package version: ${name}`);
      return [name, version];
    }),
  );
  const root = join(output, "consumer");
  const devDependencies = Object.fromEntries(
    ["typescript", "@types/bun"].map((name) => {
      const version = catalog.buildCatalog.dependencies[name];
      assert.ok(version, `Missing selected development package version: ${name}`);
      return [name, version];
    }),
  );
  yield* inspectionNative("fixture.create", () =>
    prepareNativeFixture(root, dependencies, devDependencies),
  );
  return { root, registry, dependencies, devDependencies };
});

/**
 * Rejects missing, duplicate or unselected SDKs while recording genuine isolated first-party peer contexts.
 * @param installation - Actual importer-contained physical installation.
 * @param dependencies - Selected exact packed owner and native SDK versions.
 * @param root - Canonical physical consumer root owning direct selections.
 * @returns Honest selected physical counts after all ownership and absence assertions pass.
 */
export function validateNativeClosure(
  installation: Effect.Success<ReturnType<typeof inspectInstallation>>,
  dependencies: Record<string, string>,
  root: string,
) {
  assert.deepEqual(installation.missing, []);
  const physicalCounts: Record<string, number> = {};
  for (const name of [...firstParty, ...nativePackages]) {
    const instances = installation.instances.filter((entry) => entry.name === name);
    if (name === "@relkit/langchain" || name === "@relkit/testing")
      assert.ok(instances.length > 0, `Missing selected first-party owner: ${name}`);
    else assert.equal(instances.length, 1, `Expected one actual selected instance: ${name}`);
    for (const instance of instances) assert.equal(instance.version, dependencies[name]);
    assert.equal(
      installation.edges.filter((edge) => edge.from === root && edge.name === name).length,
      1,
      `Expected one direct selected root edge: ${name}`,
    );
    physicalCounts[name] = instances.length;
  }
  assert.deepEqual(
    installation.instances
      .filter((entry) =>
        /^(?:deepagents|@relkit\/(?:deepagents|cli)$|@pulumi\/|@duckdb\/|better-auth|drizzle-orm|react(?:-dom)?$)/.test(
          entry.name,
        ),
      )
      .map((entry) => entry.name),
    [],
  );
  return physicalCounts;
}

if (import.meta.main) {
  const [artifacts, output] = process.argv.slice(2);
  if (artifacts === undefined || output === undefined)
    throw new Error(
      "Usage: bun scripts/smoke-packed-native-agents.ts <fresh-tarballs> <external-output>",
    );
  await Effect.runPromise(
    smokePackedNativeAgents(resolve(artifacts), resolve(output)).pipe(
      Effect.provide(scaffoldProcessLayer),
      Effect.scoped,
    ),
  );
}
