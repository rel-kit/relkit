/** Owns one exact packed cohort, private registry and temporary consumer tree; existing process and registry owners join shutdown before directory removal. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { consumerArtifacts } from "../../../scripts/consumer-artifacts.js";
import { consumerRegistry } from "../../../scripts/consumer-registry.js";
import { inspectionNative } from "../../../scripts/consumer-installation-native.js";
import { ScaffoldProcess } from "../../../scripts/scaffold-process.js";
import { loadInstallationCatalog } from "./installation-catalog.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Acquires the candidate once, without linking framework code into any consumer.
 * @returns Lazy context requiring Scope and the existing ScaffoldProcess service.
 */
export const installationWorkflow = Effect.gen(function* () {
  const repository = resolve(import.meta.dir, "../../..");
  const temporary = yield* Effect.acquireRelease(
    inspectionNative("docs.temporary", () => mkdtemp(join(tmpdir(), "relkit-docs-install-"))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  );
  const catalog = yield* inspectionNative("docs.catalog", () =>
    loadInstallationCatalog(repository),
  );
  const artifacts = yield* consumerArtifacts(repository, temporary);
  const registry = yield* consumerRegistry(temporary, artifacts.tarballs, artifacts.manifests);
  const tools = join(temporary, "creator");
  yield* inspectionNative("docs.creator-directory", () => mkdir(tools));
  const version = catalog.packages.get("create-relkit")?.version;
  if (version === undefined) return yield* Effect.die(new Error("Creator metadata is absent"));
  yield* inspectionNative("docs.creator-manifest", () =>
    writeFile(
      join(tools, "package.json"),
      JSON.stringify({
        name: "docs-creator",
        private: true,
        type: "module",
        dependencies: { "create-relkit": version },
      }),
    ),
  );
  yield* (yield* ScaffoldProcess).run({
    cwd: tools,
    args: ["install"],
    registry: registry.url,
    cacheDir: join(temporary, "cache"),
  });
  return {
    repository,
    temporary,
    catalog,
    registry: registry.url,
    cache: join(temporary, "cache"),
    creator: join(tools, "node_modules/create-relkit/dist/bin.js"),
    artifacts: artifacts.directory,
  } satisfies InstallationWorkflow;
});
