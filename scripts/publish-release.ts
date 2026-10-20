import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readManifest, type Artifact, type Manifest } from "./release-manifest.ts";

let logFile: string | undefined;
const visibilityAttempts = 180;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function run(args: string[], allowNotFound = false): string | undefined {
  const result = spawnSync("npm", args, {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (logFile)
    appendFileSync(
      logFile,
      `npm ${args.join(" ")} (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}\n`,
    );
  if (result.status === 0) return result.stdout.trim();
  const output = `${result.stdout}${result.stderr}`;
  if (allowNotFound && /E404|404 Not Found/.test(output)) return undefined;
  throw new Error(`npm ${args.join(" ")} failed (${result.status}):\n${output}`);
}

type PublishedPackage = Pick<Artifact, "name" | "version" | "integrity">;

function publishedIntegrity(artifact: PublishedPackage): string | undefined {
  const output = run(
    [
      "view",
      `${artifact.name}@${artifact.version}`,
      "dist.integrity",
      "--json",
      "--prefer-online",
      "--registry=https://registry.npmjs.org",
    ],
    true,
  );
  if (output === undefined || output === "") return undefined;
  const parsed: unknown = JSON.parse(output);
  if (typeof parsed !== "string")
    throw new Error(`Invalid registry integrity for ${artifact.name}`);
  return parsed;
}

/** Confirms the complete release is publicly visible before creating its GitHub release. */
export async function verifyPublishedPackages(
  packages: readonly PublishedPackage[],
  lookup: (artifact: PublishedPackage) => string | undefined | Promise<string | undefined>,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 5_000)),
): Promise<void> {
  for (const artifact of packages) {
    let integrity: string | undefined;
    for (let attempt = 0; attempt < visibilityAttempts; attempt++) {
      integrity = await lookup(artifact);
      if (integrity !== undefined) break;
      if (attempt + 1 < visibilityAttempts) await pause();
    }
    if (integrity === undefined)
      throw new Error(
        `Published package unavailable after bounded retries: ${artifact.name}@${artifact.version}. Resume with the original release artifacts; inspect publish.log.`,
      );
    if (integrity !== artifact.integrity)
      throw new Error(
        `Registry integrity mismatch: ${artifact.name}@${artifact.version}; expected ${artifact.integrity}, received ${integrity}. The immutable version cannot be overwritten.`,
      );
  }
}

function requirePublishingContext(manifest: Manifest): void {
  if (process.env.NPM_RELEASES_ENABLED !== "true")
    throw new Error("NPM_RELEASES_ENABLED must be true");
  if (process.env.GITHUB_REPOSITORY_VISIBILITY !== "public")
    throw new Error("npm publishing requires a public GitHub repository");
  if (process.env.GITHUB_REF_NAME !== "main")
    throw new Error("npm publishing is restricted to main");
  const releaseSha = process.env.RELEASE_SHA ?? process.env.GITHUB_SHA;
  if (releaseSha !== manifest.commit)
    throw new Error(`Release commit mismatch: ${manifest.commit} != ${releaseSha}`);
  if (run(["--version"]) !== "11.19.0") throw new Error("npm 11.19.0 is required");
}

async function main(): Promise<void> {
  const directoryOption = argument("--directory");
  if (directoryOption === undefined) throw new Error("--directory is required");
  const directory = resolve(directoryOption);
  const manifest = readManifest(directory);
  if (process.argv.includes("--publish")) {
    requirePublishingContext(manifest);
    logFile = join(directory, "publish.log");
    for (const artifact of manifest.packages) {
      const existing = publishedIntegrity(artifact);
      if (existing !== undefined) {
        if (existing !== artifact.integrity)
          throw new Error(`Registry integrity mismatch for ${artifact.name}@${artifact.version}`);
        console.log(`verified ${artifact.name}@${artifact.version}`);
        continue;
      }
      for (const [name, version] of Object.entries(artifact.dependencies ?? {})) {
        const dependency = manifest.packages.find((item) => item.name === name);
        if (dependency) await verifyPublishedPackages([dependency], publishedIntegrity);
        else if (publishedIntegrity({ name, version, integrity: "" }) === undefined)
          throw new Error(`Unreleased dependency: ${artifact.name} requires ${name}@${version}`);
      }
      // A historical recovery may fill missing exact versions, but must never lower latest.
      const newer = run(
        [
          "view",
          `${artifact.name}@>${artifact.version}`,
          "version",
          "--json",
          "--prefer-online",
          "--registry=https://registry.npmjs.org",
        ],
        true,
      );
      run([
        "publish",
        join(directory, artifact.file),
        "--access",
        "public",
        "--tag",
        newer === undefined || newer === "" || newer === "[]"
          ? "latest"
          : `release-${manifest.version}`,
        "--provenance",
      ]);
      console.log(`Submitted ${artifact.name}@${artifact.version}; checking registry visibility`);
      await verifyPublishedPackages([artifact], publishedIntegrity);
      console.log(`Verified published ${artifact.name}@${artifact.version}`);
    }
    await verifyPublishedPackages(manifest.packages, publishedIntegrity);
    console.log(
      `verified all ${manifest.packages.length} published packages for ${manifest.version}`,
    );
  } else {
    console.log(`verified ${manifest.packages.length} release artifacts for ${manifest.version}`);
  }
}

if (import.meta.main) await main();
