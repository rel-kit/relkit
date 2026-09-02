import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { workspacePackageDirectories } from "./workspace-packages.js";

type ChangesetStatus = {
  changesets: { summary: string }[];
  releases: { name: string; type: string; newVersion?: string }[];
};

const root = resolve(import.meta.dirname, "..");
const changesetCli = join(root, "node_modules", "@changesets", "cli", "bin.js");

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal ?? code})`));
    });
  });
}

async function readStatus(): Promise<ChangesetStatus> {
  const directory = await mkdtemp(join(tmpdir(), "relkit-changesets-"));
  const output = join(directory, "status.json");
  try {
    await run(process.execPath, [changesetCli, "status", "--output", output]);
    return JSON.parse(await readFile(output, "utf8")) as ChangesetStatus;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function renderChangelog(
  source: string,
  version: string,
  summaries: readonly string[],
): string {
  const heading = /^## Unreleased([^\n]*)\n/m.exec(source);
  if (heading?.index === undefined) throw new Error("CHANGELOG.md has no Unreleased section");
  const bodyStart = heading.index + heading[0].length;
  const nextHeading = /^## /m.exec(source.slice(bodyStart));
  const bodyEnd = nextHeading ? bodyStart + nextHeading.index : source.length;
  const body = source.slice(bodyStart, bodyEnd).trim();
  const rest = source.slice(bodyEnd).trim();
  const bullets = summaries
    .map((summary) => summary.trim().replace(/\s+/g, " "))
    .filter((summary) => summary !== "" && !body.includes(summary))
    .map((summary) => `- ${summary}`)
    .join("\n");
  const sections = [
    source.slice(0, heading.index).trimEnd(),
    "## Unreleased",
    `## ${version}${heading[1] ?? ""}`,
    body,
    bullets === "" ? "" : `### Changes\n\n${bullets}`,
    rest,
  ].filter((section) => section !== "");
  return `${sections.join("\n\n")}\n`;
}

export function renderActionChangelog(name: string, version: string): string {
  return `# ${name}\n\n## ${version}\n\nSee the root CHANGELOG.md for this fixed release train.\n`;
}

async function writeActionChangelogs(status: ChangesetStatus): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  const directories = new Map<string, string>();
  for (const directory of workspacePackageDirectories(root)) {
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      name: string;
    };
    directories.set(manifest.name, directory);
  }
  await Promise.all(
    status.releases.flatMap((release) => {
      if (!release.newVersion) return [];
      const directory = directories.get(release.name);
      if (!directory) throw new Error(`Unsupported release package: ${release.name}`);
      return [
        writeFile(
          join(directory, "CHANGELOG.md"),
          renderActionChangelog(release.name, release.newVersion),
        ),
      ];
    }),
  );
}

async function main(): Promise<void> {
  const status = await readStatus();
  if (status.changesets.length === 0) throw new Error("No changesets are available to version");
  const versions = new Set(
    status.releases.flatMap((release) => (release.newVersion ? [release.newVersion] : [])),
  );
  if (versions.size !== 1)
    throw new Error(`Fixed release produced multiple versions: ${[...versions].join(", ")}`);
  const version = [...versions][0]!;
  const changelogPath = join(root, "CHANGELOG.md");
  const changelog = renderChangelog(
    await readFile(changelogPath, "utf8"),
    version,
    status.changesets.map((changeset) => changeset.summary),
  );
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify({ version, changesets: status.changesets.length }));
    return;
  }
  await run(process.execPath, [changesetCli, "version"]);
  await run("bun", ["run", "scripts/sync-release.ts", "--write"]);
  await run("bun", ["install", "--lockfile-only"]);
  await writeFile(changelogPath, changelog);
  await run("bun", ["run", "scripts/release-check.ts", "--write-notes", "--allow-dirty"]);
  await writeActionChangelogs(status);
}

if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
