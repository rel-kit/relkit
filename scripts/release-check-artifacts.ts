import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  bun,
  command,
  digest,
  exportTargets,
  packageFields,
  readJson,
  root,
  stable,
  type PackageInfo,
  type RecordValue,
} from "./release-check-support.js";
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
  await mkdir(join(staging, "packages"));
  await writeFile(
    join(staging, "package.json"),
    `${JSON.stringify({ private: true, workspaces: ["packages/*"] }, null, 2)}\n`,
  );
  for (const item of items) {
    const target = join(staging, "packages", basename(item.directory));
    await mkdir(target);
    await cp(join(item.directory, "dist"), join(target, "dist"), {
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
}
function assertListing(item: PackageInfo, listing: string[], packed: RecordValue): void {
  for (const target of [...exportTargets(packed.exports), ...exportTargets(packed.bin)])
    if (!listing.includes(`package/${target.replace(/^\.\//, "")}`))
      throw new Error(`Packed export target is missing: ${item.name} -> ${target}`);
  for (const required of ["package/LICENSE", "package/README.md", "package/package.json"])
    if (!listing.includes(required))
      throw new Error(`Packed file is missing: ${item.name} -> ${required}`);
  const forbidden = listing.filter(
    (path) =>
      !(item.name === "create-relkit" && path.startsWith("package/dist/templates/")) &&
      (/\/(?:src|tests?|__tests__|\.turbo|\.cache)\//.test(path) ||
        /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/.test(path) ||
        /(?:tsconfig\.tsbuildinfo|\.tsbuildinfo)$/.test(path) ||
        (/\.ts$/.test(path) && !/\.d\.ts$/.test(path))),
  );
  if (forbidden.length > 0)
    throw new Error(`Packed development files found in ${item.name}: ${forbidden.join(", ")}`);
  if (item.name === "create-relkit")
    for (const template of ["agent", "api", "minimal"])
      for (const file of ["package.json", "gitignore"])
        if (!listing.includes(`package/dist/templates/default/v1/${template}/${file}`))
          throw new Error(`Packed create-relkit template is missing: ${template}/${file}`);
}
export async function packAll(
  items: PackageInfo[],
  version: string,
  destination: string,
): Promise<RecordValue[]> {
  await mkdir(destination, { recursive: true });
  const ordered = publicationOrder(items);
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
      for (const field of packageFields)
        for (const [name, spec] of Object.entries(packed[field] ?? {}))
          if (items.some((candidate) => candidate.name === name) && spec !== version)
            throw new Error(`Packed internal version mismatch: ${item.name} -> ${name}@${spec}`);
      if (JSON.stringify(stable(packed.files)) !== JSON.stringify(["dist"]))
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
export async function templateInputs(
  version: string,
  rootManifest: RecordValue,
): Promise<RecordValue[]> {
  const result: RecordValue[] = [];
  const forbidden =
    /(?:from|import)\s*["'](?:effect|hono|next|@pulumi\/|@aws-sdk\/|@relkit\/(?:compiler|engine|graph|runtime-effect|runtime-hono|supervisor|providers-local|providers-standard|cloud-aws|deploy|deploy-pulumi|observability|inspector-api))["']/;
  const scripts = {
    dev: "relkit dev",
    check: "relkit check",
    typecheck: "tsc --noEmit",
    test: "bun test",
    "test:unit": "bun test tests/unit",
    "test:integration": "bun test tests/integration",
    build: "relkit build",
    start: "relkit start",
    graph: "relkit graph print",
  };
  for (const name of ["minimal", "api", "agent"]) {
    const directory = join(root, "templates/default/v1", name);
    const manifest = await readJson(join(directory, "package.json"));
    for (const field of packageFields)
      for (const [dependency, spec] of Object.entries(manifest[field] ?? {}))
        if (dependency.startsWith("@relkit/") && spec !== version)
          throw new Error(`Template ${name} has incompatible ${dependency}@${spec}`);
    if (
      manifest.packageManager !== rootManifest.packageManager ||
      manifest.devDependencies?.typescript !== rootManifest.devDependencies?.typescript ||
      manifest.devDependencies?.["@types/bun"] !== rootManifest.devDependencies?.["@types/bun"]
    )
      throw new Error(`Template ${name} tooling versions differ from the workspace`);
    if (JSON.stringify(stable(manifest.scripts)) !== JSON.stringify(stable(scripts)))
      throw new Error(`Template ${name} scripts differ from the template contract`);
    const files = [...new Bun.Glob("**/*").scanSync({ cwd: directory, onlyFiles: true })].sort();
    for (const file of files) {
      const text = await readFile(join(directory, file), "utf8");
      if (
        text.includes("workspace:*") ||
        text.includes("<compatible-version>") ||
        forbidden.test(text)
      )
        throw new Error(`Template scan failed: ${file}`);
    }
    const tree = digest(
      (
        await Promise.all(
          files.map(async (file) => `${file}\0${await readFile(join(directory, file), "utf8")}\0`),
        )
      ).join(""),
    );
    result.push({ name, files: files.length, sha256: tree });
  }
  return result;
}
