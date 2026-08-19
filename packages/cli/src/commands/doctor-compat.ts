import { readFile } from "node:fs/promises";
import { ZSYS_DESCRIPTOR } from "@zsys/contracts";
import type { DoctorCheck } from "./doctor-support.js";

export type PackageJson = Record<string, any>;

export async function readJson(path: string): Promise<PackageJson | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function versionChecks(
  manifest: PackageJson | undefined,
  root: string,
): Promise<DoctorCheck[]> {
  if (manifest === undefined)
    return [{ name: "packages", ok: false, message: "package.json was not found." }];
  const expectedBun = packageManagerVersion(manifest);
  const bunOk = expectedBun === undefined || satisfies(Bun.version, expectedBun);
  const expectedTypeScript = dependency(manifest, "typescript") ?? "5.9.2";
  let actualTypeScript: string | undefined;
  try {
    const path = Bun.resolveSync("typescript/package.json", root);
    actualTypeScript = (JSON.parse(await readFile(path, "utf8")) as { version?: string }).version;
  } catch {}
  const typeScriptOk =
    actualTypeScript !== undefined && satisfies(actualTypeScript, expectedTypeScript);
  const zsys = zsysVersions(manifest);
  return [
    {
      name: "bun",
      ok: bunOk,
      message: bunOk
        ? `Bun ${Bun.version} is compatible.`
        : `Bun ${Bun.version} does not satisfy ${expectedBun}.`,
    },
    {
      name: "typescript",
      ok: typeScriptOk,
      message: typeScriptOk
        ? `TypeScript ${actualTypeScript} is compatible.`
        : "A compatible TypeScript installation was not found.",
    },
    { name: "zsys-packages", ok: zsys.ok, message: zsys.message, details: zsys.details },
  ];
}

function packageManagerVersion(manifest: PackageJson): string | undefined {
  const value = typeof manifest.packageManager === "string" ? manifest.packageManager : "";
  return /^bun@(.+)$/.exec(value)?.[1] ?? manifest.engines?.bun;
}
function dependency(manifest: PackageJson, name: string): string | undefined {
  return (
    manifest.dependencies?.[name] ??
    manifest.devDependencies?.[name] ??
    manifest.optionalDependencies?.[name]
  );
}
function zsysVersions(manifest: PackageJson): {
  ok: boolean;
  message: string;
  details: Readonly<Record<string, unknown>>;
} {
  const entries = Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  }).filter(([name]) => name.startsWith("@zsys/"));
  const versions = [
    ...new Set(
      entries
        .map(([, version]) => String(version))
        .filter(
          (version) => !["workspace:*", "*"].includes(version) && !version.startsWith("link:"),
        ),
    ),
  ];
  return {
    ok: versions.length <= 1,
    message:
      versions.length <= 1
        ? "ZSys package versions are compatible."
        : "ZSys package versions do not match.",
    details: { packages: entries.map(([name]) => name), versions },
  };
}

export function detectDeployment(manifest: PackageJson | undefined, app: unknown): boolean {
  const dependencies = Object.entries({
    ...manifest?.dependencies,
    ...manifest?.devDependencies,
  });
  return (
    dependencies.some(
      ([name, value]) => name.includes("pulumi") || String(value).includes("pulumi"),
    ) || providerRecipe(app) === "aws"
  );
}

export function isAppDescriptor(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value[ZSYS_DESCRIPTOR] !== true ||
    value.kind !== "app" ||
    typeof value.id !== "string"
  )
    return false;
  const providers = value.providers;
  return (
    isRecord(value.env) &&
    value.env.kind === "env-definition" &&
    isRecord(providers) &&
    providerRecipe(value) === "aws" &&
    ["development", "test", "production"].every(
      (name) => isRecord(providers[name]) && providers[name]!.kind === "provider-set",
    )
  );
}

function providerRecipe(app: unknown): unknown {
  return isRecord(app) && isRecord(app.providers) && isRecord(app.providers.production)
    ? app.providers.production.recipe
    : undefined;
}
function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function satisfies(version: string, range: string): boolean {
  try {
    return Bun.semver.satisfies(version, range);
  } catch {
    return false;
  }
}
