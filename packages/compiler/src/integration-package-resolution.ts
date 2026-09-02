import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { isStableId, type RuntimeIntegrationRegistrationMetadata } from "@relkit/contracts";
import type { RuntimeIntegrationPackage } from "./normalize-types.js";
export interface ResolveRuntimeIntegrationPackagesOptions {
  readonly projectRoot: string;
  readonly imports: readonly string[];
}
interface LoadedPackage {
  readonly root: string;
  readonly manifest: Record<string, unknown>;
}
export function resolveRuntimeIntegrationPackages(
  options: ResolveRuntimeIntegrationPackagesOptions,
): readonly RuntimeIntegrationPackage[] {
  const byId = new Map<string, RuntimeIntegrationPackage>();
  for (const specifier of [...new Set(options.imports)].sort()) {
    const imported = loadPackage(specifier, options.projectRoot);
    const target = catalogTarget(imported.manifest, specifier);
    if (target === undefined) assertAuthoringImport(imported.manifest, specifier);
    const selected = target === undefined ? imported : loadPackage(target, imported.root);
    const entry = runtimePackage(selected);
    if (entry === undefined) continue;
    const existing = byId.get(entry.integrationId);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(entry)) {
      throw new TypeError(`Integration ID "${entry.integrationId}" is owned by multiple packages.`);
    }
    byId.set(entry.integrationId, entry);
  }
  return Object.freeze([...byId.values()].sort((left, right) => compare(left, right)));
}
export function resolveIntegrationPackageRole(options: {
  readonly projectRoot: string;
  readonly packageName: string;
  readonly integrationId: string;
  readonly role:
    | "localRecipe"
    | "localMaterializer"
    | "localService"
    | "engine"
    | "host"
    | "infrastructure"
    | "access";
}): {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly integrationId: string;
  readonly exportName: string;
  readonly resolvedPath: string;
} {
  const loaded = loadPackage(options.packageName, options.projectRoot);
  const metadata = integrationMetadata(loaded.manifest);
  const packageVersion = loaded.manifest.version;
  const metadataRole = options.role === "engine" ? "deploymentEngine" : options.role;
  const exportName = record(metadata?.exports)?.[metadataRole];
  if (
    metadata?.id !== options.integrationId ||
    typeof packageVersion !== "string" ||
    typeof exportName !== "string" ||
    !exportName.startsWith("./") ||
    !Object.hasOwn(record(loaded.manifest.exports) ?? {}, exportName)
  ) {
    throw new TypeError(
      `Package "${options.packageName}" has no valid ${options.role} export for "${options.integrationId}".`,
    );
  }
  const resolvedPath = realpathSync(
    Bun.resolveSync(`${options.packageName}/${exportName.slice(2)}`, loaded.root),
  );
  if (!inside(loaded.root, resolvedPath))
    throw new TypeError(
      `Package "${options.packageName}" ${options.role} export escapes its root.`,
    );
  return Object.freeze({ ...options, packageVersion, exportName, resolvedPath });
}
function runtimePackage(loaded: LoadedPackage): RuntimeIntegrationPackage | undefined {
  const metadata = integrationMetadata(loaded.manifest);
  if (metadata === undefined) return undefined;
  const integrationId = metadata.id;
  const packageName = loaded.manifest.name;
  const packageVersion = loaded.manifest.version;
  const runtime = record(record(metadata.exports)?.runtime);
  if (runtime === undefined) return undefined;
  const exportName = runtime.export;
  if (!isStableId(integrationId)) throw new TypeError("Integration package ID is invalid.");
  if (typeof packageName !== "string" || packageName.trim() === "")
    throw new TypeError(`Integration "${integrationId}" package name is invalid.`);
  if (typeof packageVersion !== "string" || packageVersion.trim() === "")
    throw new TypeError(`Integration "${integrationId}" package version is invalid.`);
  if (typeof exportName !== "string" || !exportName.startsWith("./"))
    throw new TypeError(`Integration "${integrationId}" runtime export is invalid.`);
  const registrations = runtimeRegistrations(integrationId, runtime.registrations);
  const exports = record(loaded.manifest.exports);
  if (exports === undefined || !Object.prototype.hasOwnProperty.call(exports, exportName))
    throw new TypeError(`Package "${packageName}" does not export "${exportName}".`);
  const resolved = realpathSync(
    Bun.resolveSync(`${packageName}/${exportName.slice(2)}`, loaded.root),
  );
  if (!inside(loaded.root, resolved))
    throw new TypeError(`Package "${packageName}" runtime export escapes its package root.`);
  return Object.freeze({ integrationId, packageName, packageVersion, exportName, registrations });
}
function runtimeRegistrations(
  integrationId: string,
  value: unknown,
): readonly RuntimeIntegrationRegistrationMetadata[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new TypeError(`Integration "${integrationId}" runtime registrations are invalid.`);
  const registrations = value.map((entry) => {
    if (
      !record(entry) ||
      !isStableId(entry.capability) ||
      !isStableId(entry.adapterId) ||
      entry.protocolVersion !== 1
    ) {
      throw new TypeError(`Integration "${integrationId}" runtime registration is invalid.`);
    }
    return {
      capability: entry.capability,
      adapterId: entry.adapterId,
      protocolVersion: entry.protocolVersion,
    };
  });
  registrations.sort((left, right) => registrationKey(left).localeCompare(registrationKey(right)));
  if (new Set(registrations.map(registrationKey)).size !== registrations.length)
    throw new TypeError(`Integration "${integrationId}" has duplicate runtime registrations.`);
  return Object.freeze(registrations.map((entry) => Object.freeze(entry)));
}
function assertAuthoringImport(manifest: Record<string, unknown>, specifier: string): void {
  const metadata = integrationMetadata(manifest);
  if (metadata === undefined) return;
  const name = manifest.name;
  const authoring = record(metadata.exports)?.authoring;
  if (typeof name !== "string" || typeof authoring !== "string")
    throw new TypeError("Integration authoring export metadata is invalid.");
  const expected = authoring === "." ? name : `${name}/${authoring.replace(/^\.\//, "")}`;
  if (specifier !== expected)
    throw new TypeError(
      `Application integration import "${specifier}" is not an authoring export.`,
    );
}
function integrationMetadata(
  manifest: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return record(record(manifest.relkit)?.integration);
}
function loadPackage(specifier: string, base: string): LoadedPackage {
  const expectedName = packageName(specifier);
  const entry = realpathSync(Bun.resolveSync(specifier, base));
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    const manifestPath = join(directory, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      if (manifest.name === expectedName) return { root: realpathSync(directory), manifest };
    }
    const parent = dirname(directory);
    if (parent === directory) break;
  }
  throw new TypeError(`Package metadata was not found for "${specifier}".`);
}
function catalogTarget(manifest: Record<string, unknown>, specifier: string): string | undefined {
  const name = manifest.name;
  if (typeof name !== "string") return undefined;
  const suffix = specifier.slice(name.length);
  const target = record(record(manifest.relkit)?.catalog)?.[suffix === "" ? "." : `.${suffix}`];
  if (target === undefined) return undefined;
  if (typeof target !== "string" || target.trim() === "")
    throw new TypeError(`Catalog package "${name}" has an invalid integration target.`);
  return target;
}
function packageName(specifier: string): string {
  const segments = specifier.split("/");
  const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  if (name === undefined || name === "" || name.startsWith(".") || name.includes(":"))
    throw new TypeError(`Integration import "${specifier}" is not a package specifier.`);
  return name;
}
function inside(root: string, target: string): boolean {
  const path = relative(realpathSync(root), target);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function compare(left: RuntimeIntegrationPackage, right: RuntimeIntegrationPackage): number {
  return (
    left.integrationId.localeCompare(right.integrationId) ||
    left.packageName.localeCompare(right.packageName) ||
    left.packageVersion.localeCompare(right.packageVersion) ||
    left.exportName.localeCompare(right.exportName)
  );
}

function registrationKey(entry: RuntimeIntegrationRegistrationMetadata): string {
  return `${entry.capability}\0${entry.adapterId}\0${entry.protocolVersion}`;
}
