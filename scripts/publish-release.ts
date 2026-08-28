import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type Artifact = {
  name: string;
  version: string;
  file: string;
  sha256: string;
  sha512: string;
  integrity: string;
};
type Manifest = {
  protocol: string;
  version: string;
  commit: string;
  packageOrder: string[];
  packages: Artifact[];
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function run(args: string[], allowNotFound = false): string | undefined {
  const result = spawnSync("npm", args, { encoding: "utf8" });
  if (result.status === 0) return result.stdout.trim();
  const output = `${result.stdout}${result.stderr}`;
  if (allowNotFound && /E404|404 Not Found/.test(output)) return undefined;
  throw new Error(`npm ${args.join(" ")} failed (${result.status}):\n${output}`);
}

function digest(bytes: Buffer, algorithm: "sha256" | "sha512"): string {
  return createHash(algorithm).update(bytes).digest("hex");
}

function readManifest(directory: string): Manifest {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as Manifest;
  if (manifest.protocol !== "relkit.release-manifest.v1")
    throw new Error(`Unsupported release manifest protocol: ${manifest.protocol}`);
  if (manifest.packages.length === 0) throw new Error("Release manifest contains no packages");
  if (
    JSON.stringify(manifest.packageOrder) !==
    JSON.stringify(manifest.packages.map(({ name }) => name))
  )
    throw new Error("Release package order does not match the artifact list");
  if (new Set(manifest.packageOrder).size !== manifest.packages.length)
    throw new Error("Release manifest contains duplicate packages");
  for (const artifact of manifest.packages) {
    if (artifact.version !== manifest.version || basename(artifact.file) !== artifact.file)
      throw new Error(`Invalid release artifact entry: ${artifact.name}`);
    const bytes = readFileSync(join(directory, artifact.file));
    const sha512 = digest(bytes, "sha512");
    const integrity = `sha512-${Buffer.from(sha512, "hex").toString("base64")}`;
    if (
      digest(bytes, "sha256") !== artifact.sha256 ||
      sha512 !== artifact.sha512 ||
      integrity !== artifact.integrity
    )
      throw new Error(`Release artifact checksum mismatch: ${artifact.file}`);
  }
  return manifest;
}

function publishedIntegrity(artifact: Artifact): string | undefined {
  const output = run(
    ["view", `${artifact.name}@${artifact.version}`, "dist.integrity", "--json"],
    true,
  );
  if (output === undefined || output === "") return undefined;
  const parsed: unknown = JSON.parse(output);
  if (typeof parsed !== "string")
    throw new Error(`Invalid registry integrity for ${artifact.name}`);
  return parsed;
}

function requirePublishingContext(manifest: Manifest): void {
  if (process.env.NPM_RELEASES_ENABLED !== "true")
    throw new Error("NPM_RELEASES_ENABLED must be true");
  if (process.env.GITHUB_REPOSITORY_VISIBILITY !== "public")
    throw new Error("npm publishing requires a public GitHub repository");
  if (process.env.GITHUB_REF_NAME !== "main")
    throw new Error("npm publishing is restricted to main");
  if (process.env.GITHUB_SHA !== manifest.commit)
    throw new Error(`Release commit mismatch: ${manifest.commit} != ${process.env.GITHUB_SHA}`);
  if (run(["--version"]) !== "11.19.0") throw new Error("npm 11.19.0 is required");
}

const directoryOption = argument("--directory");
if (directoryOption === undefined) throw new Error("--directory is required");
const directory = resolve(directoryOption);
const manifest = readManifest(directory);
if (process.argv.includes("--publish")) {
  requirePublishingContext(manifest);
  for (const artifact of manifest.packages) {
    const existing = publishedIntegrity(artifact);
    if (existing !== undefined) {
      if (existing !== artifact.integrity)
        throw new Error(`Registry integrity mismatch for ${artifact.name}@${artifact.version}`);
      console.log(`verified ${artifact.name}@${artifact.version}`);
      continue;
    }
    run([
      "publish",
      join(directory, artifact.file),
      "--access",
      "public",
      "--tag",
      "latest",
      "--provenance",
    ]);
    console.log(`published ${artifact.name}@${artifact.version}`);
  }
} else {
  console.log(`verified ${manifest.packages.length} release artifacts for ${manifest.version}`);
}
