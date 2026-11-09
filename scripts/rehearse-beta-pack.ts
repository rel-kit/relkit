/**
 * Turns freshly packed release archives into the beta candidate without touching the
 * repository: it reads the next shared version from the pending changesets (the same plan
 * `version-packages.ts --check` prints), then rewrites each archive's `package.json` to the
 * beta version, with every first-party dependency pinned to it, exactly as versioning and
 * packing would. The rehearsal registry serves these archives.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Manifest } from "./pack-and-smoke-create-relkit-support.js";

const root = resolve(import.meta.dirname, "..");
const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/** Workspace manifests by package name, as the packing helpers read them. */
export type Sources = Map<string, { directory: string; manifest: Manifest }>;

/**
 * Computes the beta version of the pending release. On the release pull request the
 * changesets are already consumed and the workspace already carries the next version, so
 * that version is the candidate.
 * @returns `<next shared version>-beta.0`.
 * @throws Error When changesets give no shared next version.
 */
export function betaVersion(): string {
  if (!hasPendingChangesets()) return `${workspaceVersion()}-beta.0`;
  const result = spawnSync(process.execPath, ["scripts/version-packages.ts", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  const line = result.stdout.trim().split("\n").at(-1) ?? "";
  if (result.status !== 0 || !line.startsWith("{"))
    throw new Error(`Versioning plan failed:\n${result.stdout}${result.stderr}`);
  const plan = JSON.parse(line) as { version: string };
  return `${plan.version.replace(/-.*$/, "")}-beta.0`;
}

/** @returns Whether `.changeset` still holds changesets to version. */
function hasPendingChangesets(): boolean {
  return readdirSync(join(root, ".changeset")).some(
    (file) => file.endsWith(".md") && file !== "README.md",
  );
}

/** @returns The already-versioned shared version of the release packages. */
function workspaceVersion(): string {
  const path = join(root, "packages/relkit/package.json");
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { version: string };
    return manifest.version.replace(/-.*$/, "");
  } catch (cause) {
    throw new Error(`Cannot read the workspace version from ${path}.`, { cause });
  }
}

/**
 * Rewrites packed archives to the beta version.
 * @param tarballs - Packed archives by package name.
 * @param sources - Workspace manifests by package name.
 * @param version - Beta version.
 * @param directory - Owned folder for the rewritten archives.
 * @returns Beta archives and the matching source manifests the registry checks them against.
 */
export async function reversionArchives(
  tarballs: ReadonlyMap<string, string>,
  sources: Sources,
  version: string,
  directory: string,
): Promise<{ tarballs: Map<string, string>; sources: Sources }> {
  const archives = new Map<string, string>();
  const betaSources: Sources = new Map();
  for (const [name, source] of sources)
    betaSources.set(name, { ...source, manifest: { ...source.manifest, version } });
  for (const [name, path] of tarballs) {
    const folder = join(directory, name.replaceAll("/", "-"));
    await mkdir(folder, { recursive: true });
    tar(["-xzf", path, "-C", folder]);
    // Template manifests and the creator's provider catalog pin first-party versions too.
    for (const manifestPath of await manifestsBelow(join(folder, "package"))) {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      if (manifestPath === join(folder, "package", "package.json")) manifest.version = version;
      const relkit = manifest.relkit as { providerVersions?: Record<string, string> } | undefined;
      for (const entries of [...fields.map((field) => manifest[field]), relkit?.providerVersions])
        for (const dependency of Object.keys((entries as Record<string, string>) ?? {}))
          if (sources.has(dependency)) (entries as Record<string, string>)[dependency] = version;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const archive = join(directory, `${name.replace("@", "").replace("/", "-")}-${version}.tgz`);
    tar(["-czf", archive, "-C", folder, "package"]);
    archives.set(name, archive);
  }
  return { tarballs: archives, sources: betaSources };
}

/**
 * Runs the system `tar`.
 * @param args - Arguments.
 * @returns Nothing.
 * @throws Error When `tar` fails.
 */
function tar(args: readonly string[]): void {
  const result = spawnSync("tar", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`tar ${args.join(" ")} failed: ${result.stderr}`);
}

/**
 * Lists every `package.json` inside an extracted archive.
 * @param folder - Extracted `package` folder.
 * @returns Absolute paths, the package's own manifest included.
 */
async function manifestsBelow(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name === "package.json")
    .map((entry) => join(entry.parentPath, entry.name));
}
