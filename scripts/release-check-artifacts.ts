import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

export async function packAll(items: PackageInfo[], version: string): Promise<RecordValue[]> {
  const directory = await mkdtemp(join(tmpdir(), "zsys-release-artifacts-"));
  try {
    const artifacts: RecordValue[] = [];
    for (const item of items) {
      await command(
        bun,
        ["pm", "pack", "--ignore-scripts", "--destination", directory, "--quiet"],
        item.directory,
      );
      const prefix = item.name.startsWith("@") ? item.name.slice(1).replace("/", "-") : item.name;
      const file = (await readdir(directory)).find((candidate) =>
        candidate.startsWith(`${prefix}-${version}.`),
      );
      if (file === undefined) throw new Error(`No packed artifact found for ${item.name}`);
      const artifact = join(directory, file);
      const listing = await command("tar", ["-tzf", artifact]);
      const packed = await readJsonFromTar(artifact);
      if (
        packageFields.some((field) =>
          Object.values(packed[field] ?? {}).some((spec) => String(spec).startsWith("workspace:")),
        )
      )
        throw new Error(`Packed workspace dependency remains in ${item.name}`);
      for (const target of [...exportTargets(packed.exports), ...exportTargets(packed.bin)])
        if (!listing.split(/\r?\n/).includes(`package/${target.replace(/^\.\//, "")}`))
          throw new Error(`Packed export target is missing: ${item.name} -> ${target}`);
      artifacts.push({ name: item.name, version, file, sha256: digest(await readFile(artifact)) });
    }
    return artifacts;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function templateInputs(
  version: string,
  rootManifest: RecordValue,
): Promise<RecordValue[]> {
  const result: RecordValue[] = [];
  const forbidden =
    /(?:from|import)\s*["'](?:effect|hono|next|@pulumi\/|@aws-sdk\/|@zsys\/(?:compiler|engine|graph|runtime-effect|runtime-hono|supervisor|providers-local|cloud-aws|deploy|deploy-pulumi|observability|inspector-api))["']/;
  const scripts = {
    dev: "zsys dev",
    check: "zsys check",
    typecheck: "tsc --noEmit",
    test: "bun test",
    "test:unit": "bun test tests/unit",
    "test:integration": "bun test tests/integration",
    build: "zsys build",
    start: "zsys start",
    graph: "zsys graph print",
    "deploy:preview": "zsys deploy preview",
    deploy: "zsys deploy up",
  };
  for (const name of ["minimal", "api", "agent"]) {
    const directory = join(root, "templates/default/v1", name);
    const manifest = await readJson(join(directory, "package.json"));
    for (const dependency of [
      "@zsys/app",
      "@zsys/config",
      "@zsys/schema",
      "@zsys/cli",
      "@zsys/testing",
    ])
      if (
        manifest.dependencies?.[dependency] !== version &&
        manifest.devDependencies?.[dependency] !== version
      )
        throw new Error(`Template ${name} has incompatible ${dependency}`);
    if (
      manifest.packageManager !== rootManifest.packageManager ||
      manifest.devDependencies?.typescript !== rootManifest.devDependencies?.typescript ||
      manifest.devDependencies?.["@types/bun"] !== rootManifest.devDependencies?.["@types/bun"]
    )
      throw new Error(`Template ${name} tooling versions differ from the workspace`);
    if (JSON.stringify(stable(manifest.scripts)) !== JSON.stringify(stable(scripts)))
      throw new Error(`Template ${name} scripts differ from the v3 contract`);
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
