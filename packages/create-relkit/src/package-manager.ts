/**
 * Selects the package manager a project is created and run with, and spells its commands.
 * The creator takes `--package-manager`, then the manager that invoked it (the
 * `npm_config_user_agent` every manager sets for `npx`/`pnpm dlx`/`bunx` and `run` scripts),
 * then the runtime it runs on. The CLI reads an existing project's choice from its
 * `packageManager` field and lockfile before falling back the same way.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Package managers RelKit creates and runs projects with. */
export type PackageManagerName = "bun" | "npm" | "pnpm";

/** Supported package managers, in documentation order. */
export const PACKAGE_MANAGERS: readonly PackageManagerName[] = ["bun", "npm", "pnpm"];

/** Command spellings of one package manager. */
export interface PackageManagerCommands {
  readonly name: PackageManagerName;
  /** Installs a project's dependencies. */
  readonly install: readonly string[];
  /** Checks that the lockfile matches the manifest without changing `node_modules`. */
  readonly frozenCheck: readonly string[];
  /**
   * Runs a package script, for display.
   * @param script - Script name.
   * @returns Shell text such as `npm run dev`.
   */
  readonly run: (script: string) => string;
  /**
   * Runs an installed binary without downloading one, for display.
   * @param command - Binary and its arguments.
   * @returns Shell text such as `npx --no-install relkit dev --prepare`.
   */
  readonly exec: (command: string) => string;
  /** Adds development dependencies, for display (`bun add -d`). */
  readonly addDev: string;
}

const COMMANDS: Readonly<Record<PackageManagerName, PackageManagerCommands>> = {
  bun: {
    name: "bun",
    install: ["install"],
    frozenCheck: ["install", "--frozen-lockfile", "--dry-run"],
    run: (script) => `bun run ${script}`,
    exec: (command) => `bunx --no-install ${command}`,
    addDev: "bun add -d",
  },
  npm: {
    name: "npm",
    install: ["install", "--no-audit", "--no-fund"],
    frozenCheck: ["ci", "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund"],
    run: (script) => `npm run ${script}`,
    exec: (command) => `npx --no-install ${command}`,
    addDev: "npm install -D",
  },
  pnpm: {
    name: "pnpm",
    install: ["install"],
    frozenCheck: ["install", "--frozen-lockfile", "--lockfile-only", "--ignore-scripts"],
    run: (script) => `pnpm run ${script}`,
    exec: (command) => `pnpm exec ${command}`,
    addDev: "pnpm add -D",
  },
};

/**
 * Looks up one manager's commands.
 * @param name - Package manager.
 * @returns Its command spellings.
 */
export function packageManagerCommands(name: PackageManagerName): PackageManagerCommands {
  return COMMANDS[name];
}

/**
 * Checks a candidate name.
 * @param value - Untrusted name.
 * @returns Whether RelKit supports it.
 */
export function isPackageManagerName(value: string): value is PackageManagerName {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/**
 * Reads the manager from a user agent such as `npm/10.9.0 node/v22.13.0 darwin arm64`.
 * @param agent - `npm_config_user_agent` value.
 * @returns The manager and its version, or undefined for an absent or unsupported agent.
 */
export function packageManagerFromUserAgent(
  agent: string | undefined = process.env["npm_config_user_agent"],
): { readonly name: PackageManagerName; readonly version: string | undefined } | undefined {
  const match = /^([a-z]+)\/(\S+)/.exec(agent ?? "");
  if (match === null || !isPackageManagerName(match[1]!)) return undefined;
  return { name: match[1], version: /^\d+\.\d+\.\d+$/.test(match[2]!) ? match[2] : undefined };
}

/**
 * The manager to fall back to when nothing names one.
 * @returns Bun under Bun, npm under Node.
 */
export function runtimePackageManager(): PackageManagerName {
  return typeof process.versions.bun === "string" ? "bun" : "npm";
}

/**
 * Selects the manager for a new project.
 * @param explicit - `--package-manager` value, when given.
 * @param agent - User agent of the invoking manager.
 * @returns The selected manager.
 */
export function creationPackageManager(
  explicit?: PackageManagerName,
  agent: string | undefined = process.env["npm_config_user_agent"],
): PackageManagerName {
  return explicit ?? packageManagerFromUserAgent(agent)?.name ?? runtimePackageManager();
}

/**
 * Detects the manager an existing project uses.
 * @param root - Project root.
 * @param agent - User agent of the invoking manager.
 * @returns The `packageManager` field's manager, else the lockfile's, else the invoking one.
 */
export function projectPackageManager(
  root: string,
  agent: string | undefined = process.env["npm_config_user_agent"],
): PackageManagerName {
  try {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      readonly packageManager?: unknown;
    };
    const declared =
      typeof manifest.packageManager === "string"
        ? manifest.packageManager.split("@", 1)[0]
        : undefined;
    if (declared !== undefined && isPackageManagerName(declared)) return declared;
  } catch {
    // A missing or malformed manifest leaves the lockfile and agent to decide.
  }
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return creationPackageManager(undefined, agent);
}
