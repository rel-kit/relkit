/**
 * Traverses an external consumer's declared installed closure without evaluating
 * modules. A physical package is measured once; all encountered incoming edges
 * remain recorded. Serial I/O keeps this audit usable under memory pressure.
 */
import { realpath } from "node:fs/promises";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import {
  inspectionNative,
  consumerInputFailure,
  measurePackage,
  readConsumerManifest,
  resolveConsumerPackage,
} from "./consumer-installation-native.js";
import type {
  ConsumerInstallation,
  ConsumerManifest,
  InstallationVisit,
} from "./consumer-installation.types.js";
import type { InstalledDependency } from "./consumer-dependency-policy.types.js";
import { projectInstallationPaths } from "./consumer-installation-paths.js";
import { CONSUMER_PATH_LIMITS } from "./consumer-path-limits.js";

/**
 * Merges declared edges while retaining optional installation semantics.
 * @param manifest - Actual installed package manifest.
 * @param development - Include development declarations only at the consumer root.
 * @returns Deterministically ordered package names and absence policies.
 */
function declaredEdges(manifest: ConsumerManifest, development: boolean) {
  const entries = new Map<string, boolean>();
  for (const name of Object.keys(manifest.peerDependencies ?? {}))
    entries.set(name, manifest.peerDependenciesMeta?.[name]?.optional === true);
  for (const name of Object.keys(manifest.dependencies ?? {})) entries.set(name, false);
  if (development)
    for (const name of Object.keys(manifest.devDependencies ?? {})) entries.set(name, false);
  for (const name of Object.keys(manifest.optionalDependencies ?? {})) entries.set(name, true);
  return [...entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([name, optional]) =>
        [
          name,
          optional,
          optional &&
            manifest.peerDependenciesMeta?.[name]?.optional === true &&
            !Object.hasOwn(manifest.optionalDependencies ?? {}, name),
        ] as const,
    );
}

/**
 * Collects actual physical installations and importer-context resolution edges.
 * @param consumer - External fixture root, never the framework checkout.
 * @param options - Whether the fixture includes development requirements.
 * @returns Lazy measured closure, all bounded acyclic physical routes and required missing edges.
 * @remarks Missing compressed archive sizes remain null until separately measured.
 */
export const inspectInstallation = Effect.fn("ConsumerInstallation.inspect")(
  function* (
    consumer: string,
    options: { readonly development?: boolean } = {},
  ): Effect.fn.Return<
    ConsumerInstallation,
    | import("./consumer-installation-native.js").ConsumerInspectionError
    | import("effect/Schema").SchemaError
  > {
    const root = yield* inspectionNative("consumer.realpath", () => realpath(consumer));
    const initial = yield* readConsumerManifest(root);
    const pending: InstallationVisit[] = [
      { directory: root, packages: [initial.name], development: options.development ?? false },
    ];
    const instances = new Map<string, InstalledDependency>();
    const allocated = new Set<string>();
    const edges: ConsumerInstallation["edges"][number][] = [];
    const missing: ConsumerInstallation["missing"][number][] = [];
    for (const visit of pending) {
      const manifest = yield* readConsumerManifest(visit.directory);
      for (const [name, optional, optionalPeer] of declaredEdges(manifest, visit.development)) {
        const packages = [...visit.packages, name];
        const directory = yield* resolveConsumerPackage(root, visit.directory, name);
        if (directory === undefined) {
          if (!optional) missing.push({ packages, optional });
          continue;
        }
        if (edges.length >= CONSUMER_PATH_LIMITS.edges)
          return yield* consumerInputFailure(
            "consumer.installationBudget",
            "Installation graph edge budget exceeded",
          );
        edges.push({ from: visit.directory, to: directory, name, optionalPeer });
        if (instances.has(directory) || directory === root) continue;
        if (instances.size >= CONSUMER_PATH_LIMITS.files)
          return yield* consumerInputFailure(
            "consumer.installationBudget",
            "Installation graph file budget exceeded",
          );
        const dependency = yield* readConsumerManifest(directory);
        const size = yield* measurePackage(directory, allocated);
        instances.set(directory, {
          name: dependency.name,
          version: dependency.version ?? "unversioned",
          physicalPath: directory,
          ...size,
          archive: null,
        });
        pending.push({ directory, packages, development: false });
      }
    }
    const measured = [...instances.values()];
    const paths = yield* inspectionNative("consumer.installationPaths", async () =>
      projectInstallationPaths(root, initial.name, edges, measured),
    );
    return { instances: measured, paths, edges, missing };
  },
  (effect) => observeExecution("testing", "consumer.installation", effect),
);
