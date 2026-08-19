import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SecretScanCategory } from "./secret-scan.ts";

export interface SecretScanArtifact {
  readonly path: string;
  readonly source: string;
  readonly category: SecretScanCategory;
}

export async function artifactFiles(root: string): Promise<SecretScanArtifact[]> {
  const result: SecretScanArtifact[] = [];
  const add = async (
    directory: string,
    category: SecretScanCategory,
    filter?: (path: string) => boolean,
  ) => {
    for (const path of await files(directory))
      if (filter === undefined || filter(path))
        result.push({
          path,
          source: relative(root, path).replaceAll("\\", "/"),
          category: classify(path, category),
        });
  };
  await add(join(root, ".zsys", "generated"), "generated-source");
  await add(join(root, ".zsys", "build"), "build-image");
  await add(join(root, "templates", "default"), "generated-source");
  await add(join(root, "apps", "inspector", ".next"), "browser");
  await add(
    join(root, "openspec", "changes", "implement-zsys-typescript-poc-v3", "evidence"),
    "cloud-evidence",
  );
  await add(join(root, "tests"), "snapshots", (path) =>
    /\.(?:json|ndjson|html?|snap|snapshot|log|txt)$/i.test(path),
  );
  for (const entry of await directoryEntries(join(root, "packages")))
    await add(join(root, "packages", entry, "dist"), "generated-source");
  for (const path of ["RELEASE_CHECKLIST.md", "RELEASE_NOTES.md"])
    await add(join(root, path), "cloud-evidence");
  return result.sort((left, right) => left.source.localeCompare(right.source));
}

function classify(path: string, fallback: SecretScanCategory): SecretScanCategory {
  const value = path.replaceAll("\\", "/").toLowerCase();
  if (value.includes("/.zsys/build/")) return "build-image";
  if (value.includes(".next/")) return "browser";
  if (value.includes("pulumi") || value.includes("resource-report") || value.includes("iam-"))
    return "pulumi-reports";
  if (value.includes("graph")) return "graph";
  if (value.includes("manifest")) return "manifest";
  if (value.includes("plan")) return "plan";
  if (/\.(?:snap|snapshot)$/i.test(value)) return "snapshots";
  return fallback;
}

async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  let entries;
  try {
    if ((await stat(directory)).isFile()) return [directory];
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return result;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

async function directoryEntries(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
