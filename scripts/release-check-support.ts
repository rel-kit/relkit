import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { expectedExports } from "./release-package-contract.js";
import { workspacePackageDirectories } from "./workspace-packages.js";
import {
  dependencyFields,
  exactVersion,
  resolveDependencyFields,
  type CatalogManifest,
} from "./catalog-manifest.js";
export { exactVersion } from "./catalog-manifest.js";

export const root = resolve(import.meta.dir, "..");
export const bun = process.execPath;
export const packageFields = dependencyFields;
export type RecordValue = Record<string, any>;
export type PackageInfo = {
  directory: string;
  name: string;
  manifest: RecordValue;
};

export async function command(
  executable: string,
  args: string[],
  cwd = root,
  timeoutMs = 600_000,
): Promise<string> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error("Release command timeout must be a positive integer");
  const label = `${executable} ${args.join(" ")} in ${cwd}`;
  console.error(`Release command: ${label}`);
  const child = Bun.spawn([executable, ...args], {
    cwd,
    detached: true,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const signal = (signal: NodeJS.Signals) => {
    try {
      process.kill(-child.pid, signal);
    } catch (cause) {
      if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "ESRCH") throw cause;
    }
  };
  const stop = () => {
    if (escalation !== undefined) return;
    signal("SIGTERM");
    escalation = setTimeout(() => signal("SIGKILL"), 2_000);
  };
  const observe = <T>(pending: Promise<T>): Promise<T> =>
    pending.catch((cause) => {
      stop();
      throw cause;
    });
  const deadline = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeoutMs);
  try {
    const [stdout, stderr, exit] = await Promise.allSettled([
      observe(new Response(child.stdout).text()),
      observe(new Response(child.stderr).text()),
      observe(child.exited),
    ]);
    const output = [stdout, stderr]
      .map((result) => (result.status === "fulfilled" ? result.value : String(result.reason)))
      .join("");
    if (timedOut)
      throw new Error(`Release command timed out after ${timeoutMs}ms: ${label}\n${output}`);
    if (
      stdout.status !== "fulfilled" ||
      stderr.status !== "fulfilled" ||
      exit.status !== "fulfilled"
    )
      throw new Error(`Release command settlement failed: ${label}\n${output}`);
    if (exit.value !== 0) throw new Error(`${label} failed (${exit.value})\n${output}`);
    return stdout.value;
  } finally {
    clearTimeout(deadline);
    clearTimeout(escalation);
  }
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
  return Promise.all(
    workspacePackageDirectories(root).map(async (directory) => {
      const manifest = await readJson(join(directory, "package.json"));
      return { directory, name: String(manifest.name), manifest };
    }),
  );
}

export function exportTargets(value: any): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportTargets);
}

export function checkManifests(
  items: PackageInfo[],
  rootManifest: CatalogManifest,
): {
  version: string;
  summary: RecordValue[];
} {
  const workspaceNames = new Set(items.map((item) => item.name));
  if (items.length === 0 || items.some((item) => !exactVersion(item.manifest.version)))
    throw new Error("Every package must have an exact release version.");
  const version = String(
    items.find((item) => item.name === "create-relkit")?.manifest.version ??
      items[0]!.manifest.version,
  );
  const summary: RecordValue[] = [];
  for (const item of items) {
    const directoryName = basename(item.directory);
    const expectedName =
      relative(root, item.directory) === "integrations/catalog"
        ? "@relkit/integrations"
        : directoryName === "create-relkit" || directoryName === "relkit"
          ? directoryName
          : `@relkit/${directoryName}`;
    if (item.name !== expectedName)
      throw new Error(`Package name mismatch: ${relative(root, item.directory)}`);
    if (
      JSON.stringify(stable(item.manifest.exports)) !==
      JSON.stringify(stable(expectedExports(directoryName, item.name)))
    )
      throw new Error(`Export map mismatch: ${item.name}`);
    const expectedBin =
      directoryName === "cli" || directoryName === "relkit"
        ? { relkit: "./dist/bin.js" }
        : directoryName === "create-relkit"
          ? { "create-relkit": "./dist/bin.js" }
          : undefined;
    if (JSON.stringify(stable(item.manifest.bin)) !== JSON.stringify(stable(expectedBin)))
      throw new Error(`Binary map mismatch: ${item.name}`);
    if (
      typeof item.manifest.description !== "string" ||
      item.manifest.description.trim() === "" ||
      item.manifest.license !== "MIT" ||
      item.manifest.repository?.url !== "https://github.com/rel-kit/relkit.git" ||
      item.manifest.repository?.directory !== relative(root, item.directory) ||
      item.manifest.homepage !== "https://github.com/rel-kit/relkit#readme" ||
      item.manifest.bugs?.url !== "https://github.com/rel-kit/relkit/issues" ||
      JSON.stringify(item.manifest.files) !==
        JSON.stringify(
          directoryName === "cli"
            ? ["dist", "editor"]
            : directoryName === "create-relkit"
              ? ["dist", "src/catalog-resolution.ts", "src/catalog-resolution.types.ts"]
              : ["dist"],
        ) ||
      item.manifest.publishConfig?.access !== "public" ||
      item.manifest.engines?.bun !== ">=1.3.10" ||
      item.manifest.private === true
    )
      throw new Error(`Release metadata mismatch: ${item.name}`);
    const dependencies = resolveDependencyFields(item.manifest, rootManifest);
    for (const field of packageFields)
      for (const [name, spec] of Object.entries(dependencies[field])) {
        const valid = workspaceNames.has(name)
          ? spec === "workspace:*"
          : field === "peerDependencies" || exactVersion(spec);
        if (!valid)
          throw new Error(`Dependency is not pinned correctly: ${item.name} -> ${name}@${spec}`);
      }
    summary.push({
      name: item.name,
      version: item.manifest.version,
      exports: stable(item.manifest.exports),
      dependencyFields: Object.fromEntries(
        packageFields.map((field) => [field, stable(dependencies[field])]),
      ),
      ...(item.manifest.relkit?.buildCatalog === undefined
        ? {}
        : { buildCatalog: stable(item.manifest.relkit.buildCatalog) }),
      workspaceDependencies: Object.keys(item.manifest.dependencies ?? {})
        .filter((name) => workspaceNames.has(name))
        .sort(),
    });
  }
  return { version, summary };
}
