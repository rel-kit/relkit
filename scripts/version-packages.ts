/** Applies Changesets to the one fixed package group, certifies the generator and refreshes version-derived documentation before the release action commits its candidate; check mode only reports the plan. */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { workspacePackageDirectories } from "./workspace-packages.js";
import { sharedReleaseVersion, type ReleasePlan } from "./release-plan.js";

type ChangesetStatus = {
  changesets: { summary: string; releases?: { name: string; type: string }[] }[];
  releases: { name: string; type: string; newVersion?: string }[];
};

/** Changelog groups, in the order a release section lists them. See WRITING.md. */
export const CHANGE_KINDS = ["Breaking", "New", "Fixed"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** One changelog line and its group. */
export interface ChangelogChange {
  readonly kind: ChangeKind;
  readonly summary: string;
}

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

/**
 * Groups a changeset: a summary starting with `Breaking:`, `New:` or `Fixed:` names its group;
 * otherwise a major bump is Breaking, a minor bump New and a patch Fixed.
 * @param changeset - Summary and the package bumps it declares.
 * @returns The change as one changelog line; a Breaking change must link its migration note.
 */
export function classifyChange(changeset: ChangesetStatus["changesets"][number]): ChangelogChange {
  const text = changeset.summary.trim().replace(/\s+/g, " ");
  const prefix = /^(Breaking|New|Fixed):\s*/i.exec(text);
  const types = new Set((changeset.releases ?? []).map(({ type }) => type));
  const kind: ChangeKind = prefix
    ? (CHANGE_KINDS.find((name) => name.toLowerCase() === prefix[1]!.toLowerCase()) ?? "Fixed")
    : types.has("major")
      ? "Breaking"
      : types.has("minor")
        ? "New"
        : "Fixed";
  const summary = prefix ? text.slice(prefix[0].length) : text;
  if (kind === "Breaking" && !/\]\([^)]*migrat[^)]*\)/i.test(summary))
    throw new Error(`Breaking change has no migration link: ${summary}`);
  return { kind, summary };
}

/**
 * Promotes Unreleased into a release section with Breaking, New and Fixed groups.
 * @param source - Current CHANGELOG.md.
 * @param version - Release version.
 * @param changes - Changes from this release's changesets.
 * @returns The new changelog.
 */
export function renderChangelog(
  source: string,
  version: string,
  changes: readonly ChangelogChange[],
): string {
  const heading = /^## Unreleased([^\n]*)\n/m.exec(source);
  if (heading?.index === undefined) throw new Error("CHANGELOG.md has no Unreleased section");
  const bodyStart = heading.index + heading[0].length;
  const nextHeading = /^## /m.exec(source.slice(bodyStart));
  const bodyEnd = nextHeading ? bodyStart + nextHeading.index : source.length;
  const body = source.slice(bodyStart, bodyEnd).trim();
  const rest = source.slice(bodyEnd).trim();
  const groups = CHANGE_KINDS.map((kind) => {
    const lines = changes
      .filter((change) => change.kind === kind && change.summary !== "")
      .filter((change) => !body.includes(change.summary))
      .map((change) => `- ${change.summary}`);
    return lines.length === 0 ? "" : `### ${kind}\n\n${lines.join("\n")}`;
  });
  const sections = [
    source.slice(0, heading.index).trimEnd(),
    "## Unreleased",
    `## ${version}${heading[1] ?? ""}`,
    body,
    ...groups,
    rest,
  ].filter((section) => section !== "");
  return `${sections.join("\n\n")}\n`;
}

/**
 * Reads one release's section from the changelog.
 * @param changelog - CHANGELOG.md source.
 * @param version - Release version.
 * @returns The section body without its heading, or undefined when the release has none.
 */
export function changelogSection(changelog: string, version: string): string | undefined {
  const escaped = version.replaceAll(".", "\\.");
  const heading = new RegExp(`^## ${escaped}(?:\\s[^\\n]*)?\\n`, "m").exec(changelog);
  if (heading?.index === undefined) return undefined;
  const start = heading.index + heading[0].length;
  const next = /^## /m.exec(changelog.slice(start));
  return changelog.slice(start, next ? start + next.index : undefined).trim();
}

export function renderActionChangelog(name: string, version: string): string {
  return `# ${name}\n\n## ${version}\n\nSee the root CHANGELOG.md for this release batch.\n`;
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
  const changelogPath = join(root, "CHANGELOG.md");
  const source = await readFile(changelogPath, "utf8");
  const packages = status.releases
    .filter((item) => item.type !== "none")
    .map((item) => {
      if (!item.newVersion) throw new Error(`Missing next version: ${item.name}`);
      return { name: item.name, version: item.newVersion };
    });
  // Every breaking change must ship with a relkit migrate rule and a migration guide section.
  await run("bun", ["run", "scripts/breaking-migrations.ts"]);
  const version = sharedReleaseVersion(packages);
  const plan: ReleasePlan = { protocol: "relkit.release-plan.v1", version, packages };
  const changelog = renderChangelog(source, version, status.changesets.map(classifyChange));
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify(plan));
    return;
  }
  await run(process.execPath, [changesetCli, "version"]);
  await run("bun", ["run", "scripts/sync-release.ts", "--write"]);
  await run("bun", ["install", "--lockfile-only"]);
  // The fixed group always includes the generator.
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
