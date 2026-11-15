/** Names the package manager of the project the launcher runs in, for its install instructions. */

/** Install commands of one package manager. */
export interface InstallCommands {
  /** Installs the project's declared dependencies. */
  readonly install: string;
  /** Adds a development dependency; the package follows it. */
  readonly addDev: string;
}

const COMMANDS = {
  bun: { install: "bun install", addDev: "bun add -d" },
  npm: { install: "npm install", addDev: "npm install -D" },
  pnpm: { install: "pnpm install", addDev: "pnpm add -D" },
} as const satisfies Record<string, InstallCommands>;

/** Lockfile names per manager, in the order the project CLI checks them. */
const LOCKFILES = [
  ["bun", "bun.lock"],
  ["bun", "bun.lockb"],
  ["pnpm", "pnpm-lock.yaml"],
  ["npm", "package-lock.json"],
] as const;

/**
 * Picks the manager the same way the project CLI does: the `packageManager` field, then the
 * lockfile, then the manager that invoked the launcher, then the runtime. It needs no file
 * access of its own, because the launcher runs before any project code and has no dependencies.
 * @typeParam Manifest - Parsed `package.json`, which may be any JSON.
 * @param manifest - The project's parsed `package.json`.
 * @param hasFile - Whether a file of this name exists in the project root.
 * @param agent - `npm_config_user_agent` of the invoking manager.
 * @returns The project's install commands.
 */
export function installCommands<Manifest>(
  manifest: Manifest,
  hasFile: (name: string) => boolean,
  agent: string | undefined = process.env["npm_config_user_agent"],
): InstallCommands {
  const field =
    typeof manifest === "object" && manifest !== null && "packageManager" in manifest
      ? manifest.packageManager
      : undefined;
  const declared = typeof field === "string" ? field.split("@", 1)[0] : undefined;
  if (declared === "bun" || declared === "npm" || declared === "pnpm") return COMMANDS[declared];
  const locked = LOCKFILES.find(([, name]) => hasFile(name));
  if (locked !== undefined) return COMMANDS[locked[0]];
  const invoking = /^([a-z]+)\//.exec(agent ?? "")?.[1];
  if (invoking === "bun" || invoking === "npm" || invoking === "pnpm") return COMMANDS[invoking];
  return typeof process.versions.bun === "string" ? COMMANDS.bun : COMMANDS.npm;
}
