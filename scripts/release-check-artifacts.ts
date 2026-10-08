import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  bun,
  command,
  digest,
  readJson,
  root,
  stable,
  type PackageInfo,
  type RecordValue,
} from "./release-check-support.js";
import { assertPackedDependencies } from "./catalog-manifest.js";
import { stageReleaseRoot } from "./release-stage.js";
import { assertListing } from "./release-check-listing.js";
export { templateInputs } from "./release-check-templates.js";
async function readJsonFromTar(artifact: string): Promise<RecordValue> {
  return JSON.parse(await command("tar", ["-xOf", artifact, "package/package.json"]));
}
export function publicationOrder(items: PackageInfo[]): PackageInfo[] {
  const byName = new Map(items.map((item) => [item.name, item]));
  const pending = new Set(byName.keys());
  const ordered: PackageInfo[] = [];
  while (pending.size > 0) {
    const ready = [...pending]
      .filter((name) => {
        const manifest = byName.get(name)!.manifest;
        const dependencies = {
          ...(manifest.dependencies ?? {}),
          ...(manifest.optionalDependencies ?? {}),
        };
        return Object.keys(dependencies).every((dependency) => !pending.has(dependency));
      })
      .sort();
    if (ready.length === 0) throw new Error(`Publication cycle: ${[...pending].sort().join(", ")}`);
    for (const name of ready) {
      pending.delete(name);
      ordered.push(byName.get(name)!);
    }
  }
  return ordered;
}
async function stagePackages(items: PackageInfo[]): Promise<string> {
  const staging = await mkdtemp(join(tmpdir(), "relkit-release-stage-"));
  try {
    await mkdir(join(staging, "packages"));
    await stageReleaseRoot(root, staging, await readJson(join(root, "package.json")));
    for (const item of items) {
      const target = join(staging, "packages", basename(item.directory));
      await mkdir(target);
      for (const file of item.manifest.files as string[])
        await cp(join(item.directory, file), join(target, file), {
          recursive: true,
          filter: (path) => !/(?:^|\/)tsconfig\.tsbuildinfo$/.test(path),
        });
      await cp(join(item.directory, "package.json"), join(target, "package.json"));
      await cp(join(root, "LICENSE"), join(target, "LICENSE"));
      try {
        await cp(join(item.directory, "README.md"), join(target, "README.md"));
      } catch {
        await writeFile(
          join(target, "README.md"),
          `# ${item.name}\n\n${item.manifest.description}\n\nSee [@relkit/app](https://github.com/rel-kit/relkit) for supported application APIs.\n`,
        );
      }
    }
    await command(bun, ["install", "--lockfile-only", "--ignore-scripts"], staging);
    return staging;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
export async function packAll(
  items: PackageInfo[],
  version: string,
  destination: string,
): Promise<RecordValue[]> {
  await mkdir(destination, { recursive: true });
  const ordered = publicationOrder(items);
  const rootManifest = await readJson(join(root, "package.json"));
  const workspaceNames = new Set(items.map((item) => item.name));
  const staging = await stagePackages(ordered);
  try {
    const artifacts: RecordValue[] = [];
    for (const item of ordered) {
      const before = new Set(await readdir(destination));
      await command(
        bun,
        ["pm", "pack", "--ignore-scripts", "--destination", destination, "--quiet"],
        join(staging, "packages", basename(item.directory)),
      );
      const file = (await readdir(destination)).find(
        (candidate) => candidate.endsWith(".tgz") && !before.has(candidate),
      );
      if (file === undefined) throw new Error(`No packed artifact found for ${item.name}`);
      const artifact = join(destination, file);
      const listing = (await command("tar", ["-tzf", artifact])).trim().split(/\r?\n/);
      const packed = await readJsonFromTar(artifact);
      if (
        (await command("tar", ["-xOf", artifact, "package/LICENSE"])) !==
        (await readFile(join(root, "LICENSE"), "utf8"))
      )
        throw new Error(`Packed license mismatch: ${item.name}`);
      assertPackedDependencies(item.manifest, packed, rootManifest, workspaceNames, version);
      if (JSON.stringify(stable(packed.relkit)) !== JSON.stringify(stable(item.manifest.relkit)))
        throw new Error(`Packed RELKIT metadata mismatch: ${item.name}`);
      if (JSON.stringify(stable(packed.files)) !== JSON.stringify(stable(item.manifest.files)))
        throw new Error(`Packed files allowlist mismatch: ${item.name}`);
      assertListing(item, listing, packed);
      const bytes = await readFile(artifact);
      const sha512 = digest(bytes, "sha512");
      artifacts.push({
        name: item.name,
        version,
        file,
        sha256: digest(bytes),
        sha512,
        integrity: `sha512-${Buffer.from(sha512, "hex").toString("base64")}`,
      });
    }
    return artifacts;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
