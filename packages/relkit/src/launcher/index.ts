/** Lightweight launcher: create directly, or execute the compatible project-owned CLI. */

import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import manifest from "../../package.json" with { type: "json" };
import type { CliManifest } from "./index.types.js";
import { launchBun } from "./launch-bun.js";
import { diagnosticCode, diagnosticDocsUrl } from "../diagnostics/codes/index.js";

/** Resolves only the installed CLI declared by the nearest project manifest.
 * @param cwd - Existing project directory.
 * @returns The compatible CLI executable without invoking a package manager.
 */
export function resolveProjectCli(cwd: string): string {
  const root = projectRoot(cwd);
  const declared = declaresProjectCli(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  if (!declared)
    throw new Error(
      "RELKIT_PROJECT_CLI_REQUIRED: This project does not declare @relkit/cli. Add it with `bun add -d @relkit/cli@" +
        manifest.version +
        "`.",
    );
  for (let directory = root; ; directory = dirname(directory)) {
    const candidate = join(directory, "node_modules/@relkit/cli/package.json");
    let cli: CliManifest;
    try {
      cli = decodeCliManifest(JSON.parse(readFileSync(candidate, "utf8")));
    } catch (cause) {
      if (isMissing(cause)) {
        if (dirname(directory) !== directory) continue;
        break;
      }
      throw cause;
    }
    return validateCliEntry(candidate, cli);
  }
  throw new Error(
    "RELKIT_PROJECT_CLI_REQUIRED: This project declares @relkit/cli, but it is not installed. Run `bun install`.",
  );
}

/** Launches one selected entry on Bun or Node (see `launch-bun.ts`), preserving the child's terminal output.
 * @param argv - Original launcher arguments.
 * @param cwd - Caller-owned working directory.
 * @returns The selected command's exit status.
 */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  cwd = process.cwd(),
): Promise<number> {
  try {
    if (argv[0] === "--version" || argv[0] === "-v") {
      process.stdout.write(manifest.version + "\n");
      return 0;
    }
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
      process.stdout.write(
        "Usage: relkit create <name> [options]\n       relkit <project-command> [options] (requires the project @relkit/cli)\n",
      );
      return 0;
    }
    if (argv[0] === "create") {
      const creator = installedCreator();
      return creator === undefined
        ? await launchBun({ runPackage: `create-relkit@${manifest.version}` }, argv.slice(1), cwd)
        : await launchBun(creator, argv.slice(1), cwd);
    }
    return await launchBun(resolveProjectCli(selectedProjectRoot(argv, cwd)), argv, cwd);
  } catch (cause) {
    process.stderr.write(guidance(cause instanceof Error ? cause.message : String(cause)));
    return 1;
  }
}

/** Finds an installed creator without making it a dependency of production installs.
 * @returns The installed `create-relkit` executable, or undefined so the package runner fetches the matching release.
 */
function installedCreator(): string | undefined {
  try {
    return fileURLToPath(import.meta.resolve("create-relkit/cli"));
  } catch {
    return undefined;
  }
}

/** Adds the next step and docs link of a coded launcher failure, as the CLI prints them.
 * @param message - Failure text, starting with its `RELKIT_*` code when it has one.
 * @returns Terminal lines ending with a newline.
 */
function guidance(message: string): string {
  const code = /^(RELKIT_[A-Z_]+):/.exec(message)?.[1];
  const entry = code === undefined ? undefined : diagnosticCode(code);
  if (code === undefined || entry === undefined) return message + "\n";
  return `${message}\n  next: ${entry.fix}\n  docs: ${diagnosticDocsUrl(code)}\n`;
}

/**
 * Selects CLI ownership from the documented option without changing forwarded arguments.
 * @param argv - Original arguments; operands after the delimiter remain uninterpreted.
 * @param cwd - Original launch directory used to resolve a relative explicit root.
 * @returns Explicit application directory or the unchanged default launch directory.
 */
function selectedProjectRoot(argv: readonly string[], cwd: string): string {
  const delimiter = argv.indexOf("--");
  const { values } = parseArgs({
    args: [...(delimiter < 0 ? argv : argv.slice(0, delimiter))],
    options: { "project-root": { type: "string" } },
    strict: false,
    allowPositionals: true,
  });
  const selected = values["project-root"];
  return typeof selected === "string" ? resolve(cwd, selected) : cwd;
}

function projectRoot(cwd: string): string {
  for (let root = resolve(cwd); ; root = dirname(root)) {
    try {
      readFileSync(join(root, "package.json"));
      return root;
    } catch (cause) {
      if (!isMissing(cause)) throw cause;
    }
    if (dirname(root) === root)
      throw new Error(
        "RELKIT_PROJECT_REQUIRED: No package.json was found in this folder or its parents.",
      );
  }
}
/** Distinguishes absent local entries from malformed metadata and other filesystem failures.
 * @typeParam Cause - Original caught failure, retained until its native Error shape is checked.
 * @param cause - Failure raised while locating a local manifest.
 * @returns Whether directory ascent may continue for an absent path.
 */
function isMissing<Cause>(cause: Cause): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

/** Checks installed identity and confines the executable to its physical package.
 * @param candidate - Selected project-local package manifest.
 * @param cli - Parsed installed CLI metadata.
 * @returns The physical compatible executable, or an actionable rejection.
 */
function validateCliEntry(candidate: string, cli: CliManifest): string {
  if (cli.name !== "@relkit/cli" || cli.version !== manifest.version)
    throw new Error(
      `RELKIT_PROJECT_CLI_VERSION: relkit is ${manifest.version}, but the project's @relkit/cli is ${cli.version ?? "unreadable"}.`,
    );
  if (typeof cli.bin?.relkit !== "string")
    throw new Error("RELKIT_PROJECT_CLI_INVALID: Installed @relkit/cli has no relkit executable.");
  const owner = dirname(realpathSync(candidate));
  const entry = realpathSync(resolve(owner, cli.bin.relkit));
  const local = relative(owner, entry);
  if (
    local === ".." ||
    local.startsWith("../") ||
    isAbsolute(local) ||
    entry === fileURLToPath(import.meta.url)
  )
    throw new Error(
      "RELKIT_PROJECT_CLI_INVALID: The installed CLI executable escapes its package.",
    );
  return entry;
}

/** Reads only explicit string dependency declarations from foreign project metadata.
 * @typeParam Value - Original parsed JSON value narrowed before field access.
 * @param value - Parsed project manifest.
 * @returns Whether either supported dependency section declares the project CLI.
 */
function declaresProjectCli<Value>(value: Value): boolean {
  if (value === null || typeof value !== "object") return false;
  return (
    ("dependencies" in value && declaresCli(value.dependencies)) ||
    ("devDependencies" in value && declaresCli(value.devDependencies))
  );
}

/** Narrows one foreign dependency section before accepting a CLI declaration.
 * @typeParam Value - Original dependency field value.
 * @param value - Candidate dependencies or devDependencies field.
 * @returns Whether the field contains an explicit string CLI dependency.
 */
function declaresCli<Value>(value: Value): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "@relkit/cli" in value &&
    typeof value["@relkit/cli"] === "string"
  );
}

/** Decodes the concrete fields used to validate a selected native CLI package.
 * @typeParam Value - Original parsed JSON value narrowed before field access.
 * @param value - Installed package manifest value.
 * @returns Checked fields; missing fields retain the existing identity diagnostics.
 */
function decodeCliManifest<Value>(value: Value): CliManifest {
  if (value === null || typeof value !== "object") return {};
  let executable: string | undefined;
  if (
    "bin" in value &&
    value.bin !== null &&
    typeof value.bin === "object" &&
    "relkit" in value.bin &&
    typeof value.bin.relkit === "string"
  )
    executable = value.bin.relkit;
  return {
    ...("name" in value && typeof value.name === "string" ? { name: value.name } : {}),
    ...("version" in value && typeof value.version === "string" ? { version: value.version } : {}),
    ...(executable === undefined ? {} : { bin: { relkit: executable } }),
  };
}
