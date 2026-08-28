import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { expectedExports } from "./release-package-contract.js";

export const root = resolve(import.meta.dir, "..");
export const bun = process.execPath;
export const iteratorSkill = ".agents/skills/openspec-iterator/SKILL.md";
export const packageFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
export type RecordValue = Record<string, any>;
export type PackageInfo = { directory: string; name: string; manifest: RecordValue };

export async function command(executable: string, args: string[], cwd = root): Promise<string> {
  const child = Bun.spawn([executable, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(`${executable} ${args.join(" ")} failed (${code})\n${stdout}${stderr}`);
  return stdout;
}

export async function readJson(path: string): Promise<RecordValue> {
  return JSON.parse(await readFile(path, "utf8")) as RecordValue;
}

export function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

export function digest(value: Uint8Array | string, algorithm = "sha256"): string {
  return createHash(algorithm).update(value).digest("hex");
}

async function statusPaths(): Promise<string[]> {
  const status = await command("git", ["status", "--short", "--untracked-files=all"]);
  return status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1)!);
}

export async function assertClean(allow: ReadonlySet<string>): Promise<void> {
  const dirty = (await statusPaths()).filter((path) => !allow.has(path));
  if (dirty.length > 0)
    throw new Error(`Release check requires a clean worktree:\n${dirty.join("\n")}`);
}

export async function packages(): Promise<PackageInfo[]> {
  const entries = await readdir(join(root, "packages"), { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const directory = join(root, "packages", entry.name);
        const manifest = await readJson(join(directory, "package.json"));
        return { directory, name: String(manifest.name), manifest };
      }),
  );
}

export function exactVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      value,
    )
  );
}

export function exportTargets(value: any): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportTargets);
}

export function checkManifests(items: PackageInfo[]): {
  version: string;
  summary: RecordValue[];
} {
  const workspaceNames = new Set(items.map((item) => item.name));
  const versions = new Set(items.map((item) => item.manifest.version));
  if (versions.size !== 1 || !exactVersion(items[0]?.manifest.version))
    throw new Error("Package versions are not one exact release version.");
  const version = String(items[0]!.manifest.version);
  const summary: RecordValue[] = [];
  for (const item of items) {
    const directoryName = basename(item.directory);
    const expectedName =
      directoryName === "create-relkit" ? "create-relkit" : `@relkit/${directoryName}`;
    if (item.name !== expectedName)
      throw new Error(`Package name mismatch: ${relative(root, item.directory)}`);
    if (
      JSON.stringify(stable(item.manifest.exports)) !==
      JSON.stringify(stable(expectedExports(directoryName)))
    )
      throw new Error(`Export map mismatch: ${item.name}`);
    const expectedBin =
      directoryName === "cli"
        ? { relkit: "./dist/index.js" }
        : directoryName === "create-relkit"
          ? { "create-relkit": "./dist/index.js" }
          : undefined;
    if (JSON.stringify(stable(item.manifest.bin)) !== JSON.stringify(stable(expectedBin)))
      throw new Error(`Binary map mismatch: ${item.name}`);
    if (
      typeof item.manifest.description !== "string" ||
      item.manifest.description.trim() === "" ||
      item.manifest.license !== "MIT" ||
      item.manifest.repository?.url !== "https://github.com/rel-kit/relkit.git" ||
      item.manifest.repository?.directory !== `packages/${directoryName}` ||
      item.manifest.homepage !== "https://github.com/rel-kit/relkit#readme" ||
      item.manifest.bugs?.url !== "https://github.com/rel-kit/relkit/issues" ||
      JSON.stringify(item.manifest.files) !== JSON.stringify(["dist"]) ||
      item.manifest.publishConfig?.access !== "public" ||
      item.manifest.engines?.bun !== ">=1.3.10" ||
      item.manifest.private === true
    )
      throw new Error(`Release metadata mismatch: ${item.name}`);
    for (const field of packageFields)
      for (const [name, spec] of Object.entries(item.manifest[field] ?? {})) {
        const valid = workspaceNames.has(name)
          ? spec === "workspace:*"
          : field === "peerDependencies" || exactVersion(spec);
        if (!valid)
          throw new Error(`Dependency is not pinned correctly: ${item.name} -> ${name}@${spec}`);
      }
    summary.push({
      name: item.name,
      version,
      exports: stable(item.manifest.exports),
      dependencyFields: Object.fromEntries(
        packageFields.map((field) => [field, stable(item.manifest[field] ?? {})]),
      ),
      workspaceDependencies: Object.keys(item.manifest.dependencies ?? {})
        .filter((name) => workspaceNames.has(name))
        .sort(),
    });
  }
  return { version, summary };
}
