/** Runs native consumer code and inspects an independently built executable artifact. */
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { ScaffoldProcess } from "./scaffold-process.js";
import { inspectionNative, readConsumerManifest } from "./consumer-installation-native.js";
import { consumerModulePaths } from "./consumer-module-paths.js";
import type { ConsumerInstallation } from "./consumer-installation.types.js";

const Metafile = Schema.Struct({
  inputs: Schema.Record(
    Schema.String,
    Schema.Struct({
      imports: Schema.Array(
        Schema.Struct({ path: Schema.String, external: Schema.optional(Schema.Boolean) }),
      ),
    }),
  ),
  outputs: Schema.Record(
    Schema.String,
    Schema.Struct({
      inputs: Schema.Record(Schema.String, Schema.Struct({ bytesInOutput: Schema.Number })),
    }),
  ),
});

/** Missing optional peers stay external; native execution still fails if one is evaluated. */
const absentOptionalPeers = Effect.fn("ConsumerProbe.optionalPeers")(function* (
  installation: ConsumerInstallation,
) {
  const absent = new Set<string>();
  for (const instance of installation.instances) {
    const manifest = yield* readConsumerManifest(instance.physicalPath);
    for (const [name, policy] of Object.entries(manifest.peerDependenciesMeta ?? {}))
      if (
        policy.optional &&
        !installation.edges.some(
          (edge) => edge.from === instance.physicalPath && edge.name === name,
        )
      )
        absent.add(name);
  }
  const present = new Set(installation.instances.map((instance) => instance.name));
  return [...absent].filter((name) => !present.has(name)).sort();
});

/** Projects actual native bundler input edges and separately retained output bytes. */
function bundleObservations(
  root: string,
  entry: string,
  installation: ConsumerInstallation,
  consumerName: string,
  metadata: typeof Metafile.Type,
  evidence: string,
) {
  root = realpathSync(root);
  const files = Object.keys(metadata.inputs).map((path) => resolve(root, path));
  const inputs = new Set(files.map((file) => realpathSync(file)));
  const edges = Object.entries(metadata.inputs).flatMap(([from, value]) =>
    value.imports
      .filter((imported) => !imported.external && !isBuiltin(imported.path))
      .map((imported) => ({
        from: resolve(root, from),
        to: isAbsolute(imported.path)
          ? imported.path
          : inputs.has(resolve(root, imported.path))
            ? resolve(root, imported.path)
            : Bun.resolveSync(imported.path, dirname(resolve(root, from))),
      }))
      .filter((edge) => inputs.has(realpathSync(edge.to))),
  );
  const graph = consumerModulePaths(
    resolve(root, entry),
    files,
    edges,
    root,
    installation,
    "artifact",
    consumerName,
  );
  const included = new Set(
    Object.values(metadata.outputs).flatMap((output) =>
      Object.entries(output.inputs)
        .filter(([, contribution]) => contribution.bytesInOutput > 0)
        .map(([path]) => relative(root, resolve(root, path))),
    ),
  );
  return {
    artifact: {
      boundary: "artifact" as const,
      evidence,
      complete: graph.unreached.length === 0,
      paths: graph.paths
        .filter((path) => included.has(path.artifact ?? ""))
        .map((path) => ({ ...path, boundary: "artifact" as const })),
    },
    unreached: graph.unreached,
  };
}

/** Both executions use the consumer's actual resolution root, without workspace links. */
export const probeConsumerBundle = Effect.fn("ConsumerProbe.bundle")(function* (
  root: string,
  entry: string,
  installation: ConsumerInstallation,
  consumerName: string,
) {
  const process = yield* ScaffoldProcess;
  const nativeOutput = yield* process.run({
    cwd: root,
    args: ["run", "--no-install", "--no-env-file", entry],
    env: { NODE_ENV: "production" },
  });
  const absent = yield* absentOptionalPeers(installation);
  const artifact = join(root, ".consumer-probe/bundle.js"),
    metadataPath = join(root, ".consumer-probe/metafile.json");
  const buildOutput = yield* process.run({
    cwd: root,
    args: [
      "build",
      entry,
      "--target=bun",
      "--minify",
      `--outfile=${artifact}`,
      `--metafile=${metadataPath}`,
      ...absent.map((name) => `--external=${name}`),
    ],
  });
  const artifactOutput = yield* process.run({
    cwd: root,
    args: ["run", "--no-install", "--no-env-file", artifact],
    env: { NODE_ENV: "production" },
  });
  const text = yield* inspectionNative("probe.metafile", () => readFile(metadataPath, "utf8"));
  const metadata = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Metafile))(text);
  return {
    nativeOutput,
    buildOutput,
    artifactOutput,
    ...bundleObservations(root, entry, installation, consumerName, metadata, metadataPath),
  };
});
