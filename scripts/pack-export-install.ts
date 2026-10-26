/** Installs selected public entries through the existing isolated package manager and exact archive registry. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { consumerRegistry } from "./consumer-registry.js";
import { consumerInstallCommand } from "./consumer-install-command.js";
import { readManifests, readPackedManifest } from "./pack-and-smoke-create-relkit-pack.js";
import { PackedTypeCatalog } from "./consumer-packed-type.schemas.js";
import { writePackedDrizzlePatch } from "./consumer-packed-type-validation.js";
import { exportNative } from "./pack-export-native.js";
import type { ExportCommand } from "./pack-export.types.js";
import { consumerInputFailure } from "./consumer-installation-native.js";

/**
 * Captures the existing registry, packed native pins and command authority within the caller's Scope.
 * @param run - Existing finite child owner with joined output and shutdown.
 * @param temporary - Outer acceptance root owning the private registry and cache.
 * @param repository - Read-only workspace identities used to reject first-party registry fallback.
 * @param tarballs - Exact required archives, including creator-owned repair assets.
 * @returns An installation operation borrowing the registry until the enclosing Scope closes.
 */
export const makeExportInstaller = Effect.fn("ExportSmoke.installer")(function* (
  run: ExportCommand,
  temporary: string,
  repository: string,
  tarballs: Map<string, string>,
) {
  const context = yield* exportInstallContext(temporary, repository, tarballs);
  return (root: string, names: readonly string[]) => installSelection(run, context, root, names);
});

/** Keeps candidate metadata and registry lifetime with the outer export acceptance owner. */
const exportInstallContext = Effect.fn("ExportSmoke.installContext")(function* (
  temporary: string,
  repository: string,
  tarballs: Map<string, string>,
) {
  const source = yield* exportNative("registry.manifests", () => readManifests(repository));
  const registry = yield* consumerRegistry(temporary, tarballs, source);
  const manifests = new Map<string, Awaited<ReturnType<typeof readPackedManifest>>>();
  for (const [name, archive] of tarballs)
    manifests.set(name, yield* exportNative("packed.manifest", () => readPackedManifest(archive)));
  const creator = tarballs.get("create-relkit");
  if (creator === undefined)
    return yield* consumerInputFailure(
      "export.creator",
      "Packed creator is required for selected SDK repairs",
    );
  const catalog = yield* Schema.decodeUnknownEffect(PackedTypeCatalog)(
    manifests.get("create-relkit")?.relkit,
  );
  return {
    registry: registry.url,
    cache: join(temporary, "install-cache"),
    manifests,
    creator,
    catalog,
  };
});

/** Selects exact native peers from packed declarations and delegates transitive layout to Bun. */
const installSelection = Effect.fn("ExportSmoke.installSelection")(function* (
  run: ExportCommand,
  context: Effect.Success<ReturnType<typeof exportInstallContext>>,
  root: string,
  names: readonly string[],
) {
  const dependencies: Record<string, string> = {};
  for (const name of names) {
    const manifest = context.manifests.get(name);
    if (manifest === undefined)
      return yield* consumerInputFailure("export.selection", `Missing packed selection ${name}`);
    Object.assign(dependencies, manifest.peerDependencies, { [name]: manifest.version });
  }
  yield* exportNative("selected.release-copy", () =>
    rm(join(root, "node_modules"), { recursive: true, force: true }),
  );
  yield* writeSelection(root, dependencies, context);
  const command = yield* consumerInstallCommand(
    "bun-isolated",
    { name: "public-exports", dependencies, devDependencies: {}, production: false },
    root,
    context.registry,
    context.cache,
  );
  yield* run({ ...command, args: [...command.args, "--ignore-scripts"] });
});

/** Reuses verified packed repair bytes only when the selected public exports require their SDK. */
const writeSelection = Effect.fn("ExportSmoke.selectionManifest")(function* (
  root: string,
  dependencies: Readonly<Record<string, string>>,
  context: Effect.Success<ReturnType<typeof exportInstallContext>>,
) {
  const catalog = context.catalog.buildCatalog;
  const patch = catalog.patches["drizzle-orm"];
  if (
    dependencies["drizzle-orm"] !== undefined &&
    dependencies["drizzle-orm"] !== catalog.dependencies["drizzle-orm"]
  )
    return yield* consumerInputFailure(
      "export.patch",
      "Selected Drizzle version does not match packed repair metadata",
    );
  if (dependencies["drizzle-orm"] !== undefined)
    yield* writePackedDrizzlePatch(root, context.creator, patch);
  const overrides = { "@better-fetch/fetch": catalog.dependencies["@better-fetch/fetch"] };
  yield* exportNative("selected.manifest", async () => {
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies,
        ...(dependencies["drizzle-orm"] === undefined
          ? {}
          : {
              patchedDependencies: { [patch.key]: "patches/drizzle-orm.patch" },
            }),
        ...(dependencies["better-auth"] === undefined ? {} : { overrides }),
      }),
    );
  });
});
