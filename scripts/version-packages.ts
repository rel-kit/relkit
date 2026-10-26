/** Applies Changesets, certifies changed generator assets and refreshes version-derived documentation before the release action commits its candidate; check mode only reports the plan. */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { workspacePackageDirectories } from "./workspace-packages.js";
import { generatorProviders, nextReleaseVersion, type ReleasePlan } from "./release-plan.js";
import { packedTemplates } from "./release-templates.js";
import { dependencyFields } from "./catalog-manifest.js";

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
  return `# ${name}\n\n## ${version}\n\nSee the root CHANGELOG.md for this release batch.\n`;
}

/** Template and optional-provider pins are bundled assets, not runtime imports. */
async function includeGenerator(status: ChangesetStatus): Promise<ChangesetStatus> {
  const inputs = new Set<string>(generatorProviders);
  for (const template of packedTemplates) {
    const manifest = JSON.parse(
      await readFile(join(root, "templates/default/v1", template, "package.json"), "utf8"),
    );
    for (const field of dependencyFields)
      for (const name of Object.keys(manifest[field] ?? {})) inputs.add(name);
  }
  if (
    status.releases.some((item) => item.type !== "none" && inputs.has(item.name)) &&
    !status.releases.some((item) => item.name === "create-relkit" && item.type !== "none")
  ) {
    const path = join(root, ".changeset/relkit-template-inputs.md");
    await writeFile(
      path,
      '---\n"create-relkit": patch\n---\n\nRefresh bundled dependency versions.\n',
      { flag: "wx" },
    );
    try {
      return await readStatus();
    } finally {
      if (process.argv.includes("--check")) await rm(path);
    }
  }
  return status;
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
  let status = await readStatus();
  if (status.changesets.length === 0) throw new Error("No changesets are available to version");
  const changelogPath = join(root, "CHANGELOG.md");
  const source = await readFile(changelogPath, "utf8");
  const version = nextReleaseVersion(source);
  status = await includeGenerator(status);
  const plan: ReleasePlan = {
    protocol: "relkit.release-plan.v1",
    version,
    packages: status.releases
      .filter((item) => item.type !== "none")
      .map((item) => {
        if (!item.newVersion) throw new Error(`Missing next version: ${item.name}`);
        return { name: item.name, version: item.newVersion };
      }),
  };
  const changelog = renderChangelog(
    source,
    version,
    status.changesets.map((changeset) => changeset.summary),
  );
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify(plan));
    return;
  }
  await run(process.execPath, [changesetCli, "version"]);
  await run("bun", ["run", "scripts/sync-release.ts", "--write"]);
  await run("bun", ["install", "--lockfile-only"]);
  if (plan.packages.some((item) => item.name === "create-relkit"))
    await run("bun", ["run", "scripts/certify-create.ts"]);
  await run("bun", ["run", "version:docs"]);
  await writeFile(join(root, ".changeset/release.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(changelogPath, changelog);
  await run("bun", [
    "run",
    "scripts/release-check.ts",
    "--notes-only",
    "--write-notes",
    "--allow-dirty",
  ]);
  await writeActionChangelogs(status);
}

if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
