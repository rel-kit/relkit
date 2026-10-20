import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readManifest, type Artifact, type Manifest } from "./release-manifest.ts";

let logFile: string | undefined;
const visibilityAttempts = 180;
let publicationDeadline = Infinity;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function run(args: string[], allowNotFound = false): string | undefined {
  const remaining = publicationDeadline - Date.now();
  if (remaining <= 0)
    throw new Error(
      "Release publication deadline (25 minutes) exceeded. Resume with the original release artifacts; inspect publish.log.",
    );
  const result = spawnSync("npm", args, {
    encoding: "utf8",
    timeout: Math.min(30_000, remaining),
    maxBuffer: 8 * 1024 * 1024,
  });
  if (logFile)
    appendFileSync(
      logFile,
      `npm ${args.join(" ")} (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}\n`,
    );
  if (result.status === 0) return result.stdout.trim();
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`;
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
  now: () => number = Date.now,
  report: (pending: number) => void = () => {},
): Promise<void> {
  const pending = new Set(packages);
  const deadline = now() + 900_000;
  rounds: for (let attempt = 0; attempt < visibilityAttempts && pending.size > 0; attempt++) {
    for (const artifact of pending) {
      if (now() >= deadline) break rounds;
      const integrity = await lookup(artifact);
      if (now() >= deadline) break rounds;
      if (integrity === undefined) continue;
      if (integrity !== artifact.integrity)
        throw new Error(
          `Registry integrity mismatch: ${artifact.name}@${artifact.version}; expected ${artifact.integrity}, received ${integrity}. The immutable version cannot be overwritten.`,
        );
      pending.delete(artifact);
    }
    report(pending.size);
    if (pending.size > 0 && attempt + 1 < visibilityAttempts && now() < deadline) await pause();
  }
  if (pending.size > 0)
    throw new Error(
      `Published packages unavailable after the shared 15-minute visibility window: ${[...pending].map((item) => `${item.name}@${item.version}`).join(", ")}. Resume with the original release artifacts; inspect publish.log.`,
    );
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
    logFile = join(directory, "publish.log");
    publicationDeadline = Date.now() + 1_500_000;
    requirePublishingContext(manifest);
    const batch = new Set(manifest.packages.map((artifact) => artifact.name));
    const checkedDependencies = new Set<string>();
    for (const artifact of manifest.packages) {
      for (const [name, version] of Object.entries(artifact.dependencies ?? {})) {
        const key = `${name}@${version}`;
        if (batch.has(name) || checkedDependencies.has(key)) continue;
        if (publishedIntegrity({ name, version, integrity: "" }) === undefined)
          throw new Error(`Unreleased dependency: ${artifact.name} requires ${key}`);
        checkedDependencies.add(key);
      }
    }
    for (const artifact of manifest.packages) {
      const existing = publishedIntegrity(artifact);
      if (existing !== undefined) {
        if (existing !== artifact.integrity)
          throw new Error(`Registry integrity mismatch for ${artifact.name}@${artifact.version}`);
        console.log(`verified ${artifact.name}@${artifact.version}`);
        continue;
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
      try {
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
      } catch (cause) {
        // npm can reject an already accepted version while public metadata still returns 404.
        if (
          !(cause instanceof Error) ||
          !/\bE403\b/.test(cause.message) ||
          !/cannot publish over the previously published versions/i.test(cause.message)
        )
          throw cause;
        console.log(
          `Already submitted ${artifact.name}@${artifact.version}; verifying integrity before continuing`,
        );
        await verifyPublishedPackages([artifact], publishedIntegrity);
      }
      console.log(`Submitted ${artifact.name}@${artifact.version}; continuing in dependency order`);
    }
    let lastPending = -1,
      lastReport = 0;
    await verifyPublishedPackages(
      manifest.packages,
      publishedIntegrity,
      undefined,
      Date.now,
      (pending) => {
        if (pending !== lastPending || Date.now() - lastReport >= 60_000) {
          console.log(
            `Registry visibility: ${manifest.packages.length - pending}/${manifest.packages.length} verified; ${pending} pending (one shared 15-minute deadline)`,
          );
          lastPending = pending;
          lastReport = Date.now();
        }
      },
    );
    console.log(
      `verified all ${manifest.packages.length} published packages for ${manifest.version}`,
    );
  } else {
    console.log(`verified ${manifest.packages.length} release artifacts for ${manifest.version}`);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    if (logFile) appendFileSync(logFile, `Publication failed: ${String(cause)}\n`);
    throw cause;
  }
}
