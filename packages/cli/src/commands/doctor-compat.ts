/** Checks each installed tool and independently versioned package against its authored project declaration. */
import { Effect, Layer, Schema } from "effect";
import { dirname, join, resolve } from "node:path";
import { generatorFileSystemLive, resolveProjectDependenciesEffect } from "../scaffolding/index.js";
import cliManifest from "../../package.json" with { type: "json" };
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import type { DoctorCheck, PackageJson } from "./doctor.types.js";
import { doctorDependencies } from "./doctor.schemas.js";
import { CliDoctorToolchain, doctorToolchainLayer } from "./doctor-toolchain.service.js";
export type { PackageJson } from "./doctor.types.js";
import { readJsonEffect, packageManagerVersion, record } from "./doctor-compat-metadata.js";
export {
  readJsonEffect,
  readJson,
  detectDeployment,
  isAppDescriptor,
} from "./doctor-compat-metadata.js";

/**
 * Compares installed versions with strictly resolved project catalogs.
 * @param manifest - Optional authored package metadata.
 * @param root - Project catalog and dependency resolution root.
 * @returns Ordered Bun, TypeScript and RELKIT compatibility results.
 */
export const versionChecksEffect = Effect.fn("Doctor.versions")(
  function* (manifest: PackageJson | undefined, root: string) {
    if (manifest === undefined)
      return [{ name: "packages", ok: false, message: "package.json was not found." }];
    const expectedBun = packageManagerVersion(manifest);
    const toolchain = yield* CliDoctorToolchain;
    const bunVersion = yield* toolchain.bunVersion();
    const bunOk =
      expectedBun === undefined || (yield* toolchain.satisfies(bunVersion, expectedBun));
    const resolution = yield* Effect.result(resolveDeclaredDependencies(manifest, root));
    if (resolution._tag === "Failure")
      return [
        {
          name: "packages",
          ok: false,
          message: `Dependency versions could not be resolved: ${resolution.failure instanceof Error ? resolution.failure.message : String(resolution.failure)}`,
        },
      ];
    const dependencies = resolution.success;
    const expectedTypeScript =
      dependencies.typescript ?? cliManifest.relkit.buildCatalog.dependencies.typescript;
    const metadata = yield* toolchain.typeScriptPath(root).pipe(
      Effect.flatMap(readJsonEffect),
      Effect.catchTag("CliAdapterError", () => Effect.succeed(undefined)),
    );
    const actualTypeScript = typeof metadata?.version === "string" ? metadata.version : undefined;
    const typeScriptOk =
      actualTypeScript !== undefined &&
      (yield* toolchain.satisfies(actualTypeScript, expectedTypeScript));
    const relkit = yield* relkitVersions(dependencies, root);
    return [
      {
        name: "bun",
        ok: bunOk,
        message: bunOk
          ? `Bun ${bunVersion} is compatible.`
          : `Bun ${bunVersion} does not satisfy ${expectedBun}.`,
      },
      {
        name: "typescript",
        ok: typeScriptOk,
        message: typeScriptOk
          ? `TypeScript ${actualTypeScript} is compatible.`
          : "A compatible TypeScript installation was not found.",
      },
      { name: "relkit-packages", ok: relkit.ok, message: relkit.message, details: relkit.details },
    ] satisfies DoctorCheck[];
  },
  (effect) => observeCli("doctor.versions", effect),
);

/**
 * Preserves standalone compatibility checks with an explicit native graph.
 * @param manifest - Authored metadata.
 * @param root - Project root.
 * @returns Ordered compatibility results.
 */
export function versionChecks(
  manifest: PackageJson | undefined,
  root: string,
): Promise<DoctorCheck[]> {
  return runCliEffect(
    versionChecksEffect(manifest, root).pipe(Effect.provide(generatorFileSystemLive)),
    Layer.merge(fileSystemLayer, doctorToolchainLayer),
  );
}

/** Checks each installed RELKIT package against its own declaration.
 * @param dependencies - Strictly resolved version specifications.
 * @param root - Project dependency resolution root.
 * @returns Compatibility and package/version names suitable for public diagnostics.
 */
const relkitVersions = Effect.fn("Doctor.relkitVersions")(function* (
  dependencies: Readonly<Record<string, string>>,
  root: string,
) {
  const toolchain = yield* CliDoctorToolchain;
  const entries = Object.entries(dependencies).filter(
    ([name]) => name.startsWith("@relkit/") || name === "relkit" || name === "create-relkit",
  );
  const mismatches: { name: string; expected: string; installed: unknown }[] = [];
  for (const [name, expected] of entries) {
    if (expected.startsWith("workspace:") || expected.startsWith("link:")) continue;
    const metadata = yield* installedPackage(root, name);
    const installed = metadata?.version;
    const range = expected.startsWith("file:") ? "*" : expected;
    if (
      metadata?.name !== name ||
      typeof installed !== "string" ||
      !(yield* toolchain.satisfies(installed, range))
    )
      mismatches.push({ name, expected, installed: installed ?? null });
  }
  return {
    ok: mismatches.length === 0,
    message:
      mismatches.length === 0
        ? "RelKit package versions are compatible."
        : `RelKit installations do not satisfy their declarations: ${mismatches.map(({ name }) => name).join(", ")}.`,
    details: {
      packages: entries.map(([name]) => name),
      versions: [...new Set(entries.map(([, version]) => version))],
      mismatches,
    },
  };
});

/** Reads metadata without requiring package.json to be publicly exported.
 * @param root - Project directory, including nested workspace projects.
 * @param name - Declared first-party package name.
 * @returns Nearest installation metadata, or undefined when absent or malformed.
 */
const installedPackage = Effect.fn("Doctor.installedPackage")(function* (
  root: string,
  name: string,
) {
  const files = yield* CliFileSystem;
  for (let current = resolve(root); ; current = dirname(current)) {
    const path = join(current, "node_modules", name, "package.json");
    if (yield* files.exists(path)) return yield* readJsonEffect(path);
    if (dirname(current) === current) return undefined;
  }
});

/** Resolves optional, development and production declarations in the existing precedence order. */
const resolveDeclaredDependencies = Effect.fn("Doctor.declarations")(function* (
  manifest: PackageJson,
  root: string,
) {
  const specifications = yield* Schema.decodeUnknownEffect(doctorDependencies)({
    ...record(manifest.optionalDependencies),
    ...record(manifest.devDependencies),
    ...record(manifest.dependencies),
  });
  return yield* resolveProjectDependenciesEffect(root, specifications);
});
