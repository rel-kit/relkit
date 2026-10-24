/** Reads optional doctor metadata and descriptor markers without loading native integrations. */
import { Effect, Schema } from "effect";
import { isDescriptor } from "@relkit/contracts";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import type { PackageJson } from "./doctor.types.js";
import { doctorJsonObject } from "./doctor.schemas.js";
/**
 * Reads optional metadata through explicit file authority.
 * @param path - Selected metadata path.
 * @returns A lazy object or undefined for the existing missing/malformed contract.
 */
export const readJsonEffect = Effect.fn("Doctor.readJson")(
  function* (path: string) {
    return yield* (yield* CliFileSystem).readText(path).pipe(
      Effect.flatMap((source) => cliTry("doctor.json", () => JSON.parse(source) as unknown)),
      Effect.map((value) => (Schema.is(doctorJsonObject)(value) ? value : undefined)),
      Effect.catchTag("CliAdapterError", () => Effect.succeed(undefined)),
    );
  },
  (effect) => observeCli("doctor.readJson", effect),
);

/**
 * Preserves optional metadata reads at the Promise edge.
 * @param path - Metadata path.
 * @returns Parsed object, or undefined when unavailable.
 */
export function readJson(path: string): Promise<PackageJson | undefined> {
  return runCliEffect(readJsonEffect(path), fileSystemLayer);
}

/** Resolves the authored Bun compatibility pin without retaining other metadata.
 * @param manifest - Object metadata boundary.
 * @returns Package-manager pin, engine range, or undefined.
 */
export function packageManagerVersion(manifest: PackageJson): string | undefined {
  const value = typeof manifest.packageManager === "string" ? manifest.packageManager : "";
  const engine = record(manifest.engines).bun;
  return /^bun@(.+)$/.exec(value)?.[1] ?? (typeof engine === "string" ? engine : undefined);
}

/** Detects the established explicit or dependency-owned Pulumi opt-in.
 * @param manifest - Optional metadata object.
 * @param config - Validated configuration or unknown candidate.
 * @returns Whether deployment prerequisites should run.
 */
export function detectDeployment(manifest: PackageJson | undefined, config: unknown): boolean {
  const dependencies = Object.entries({
    ...record(manifest?.dependencies),
    ...record(manifest?.devDependencies),
  });
  return (
    dependencies.some(
      ([name, value]) => name.includes("pulumi") || String(value).includes("pulumi"),
    ) ||
    (isRecord(config) && config.deployment !== undefined)
  );
}

/** Preserves the opaque application/defineEnv marker compatibility contract.
 * @param value - Imported descriptor candidate.
 * @returns Whether the application and environment markers are present.
 */
export function isAppDescriptor(value: unknown): boolean {
  if (!isRecord(value) || !isDescriptor(value, "app")) return false;
  const env = Reflect.get(value, "env");
  return isRecord(env) && env.kind === "env-definition";
}

/** Narrows an arbitrary metadata object without interpreting its values.
 * @param value - Candidate boundary object.
 * @returns Whether it is a non-array record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Selects object fields without granting an unvalidated dependency shape.
 * @param value - Untrusted optional metadata section.
 * @returns The object boundary or an empty section.
 */
export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
