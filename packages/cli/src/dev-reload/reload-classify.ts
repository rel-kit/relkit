/**
 * Decides from changed paths alone whether a save needs a full blue/green restart. The
 * development loop swaps handlers in place only when configuration, provider bindings,
 * environment contracts and installed dependencies are untouched; any change to those
 * inputs restarts the server with the existing readiness checks. Pure and synchronous.
 */
import { basename, isAbsolute, relative, resolve } from "node:path";

/** File names whose change always restarts the server. */
const RESTART_FILES = new Set([
  "relkit.config.ts",
  "package.json",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "bunfig.toml",
]);

/**
 * Names the reason a set of changes needs a restart.
 * @param projectRoot - Absolute application root.
 * @param changedFiles - Changed paths, project-relative or absolute.
 * @returns The first restart reason, or undefined when the changes may be swapped in place.
 */
export function restartReason(
  projectRoot: string,
  changedFiles: readonly string[],
): string | undefined {
  if (changedFiles.length === 0) return "no changed files were reported";
  for (const changed of changedFiles) {
    const file = portable(projectRoot, changed);
    const name = basename(file);
    if (RESTART_FILES.has(name)) return `${file} changed`;
    if (name === ".env" || name.startsWith(".env.")) return `${file} changed`;
    // Environment contracts and provider fragments live under src/platform.
    if (file.startsWith("src/platform/")) return `${file} is platform configuration`;
    if (file.startsWith("node_modules/") || file.includes("/node_modules/"))
      return `${file} is an installed dependency`;
  }
  return undefined;
}

/**
 * Normalizes one changed path to a project-relative forward-slash path.
 * @param projectRoot - Absolute application root.
 * @param file - Changed path.
 * @returns Project-relative path.
 */
function portable(projectRoot: string, file: string): string {
  const absolute = isAbsolute(file) ? file : resolve(projectRoot, file);
  return relative(projectRoot, absolute).replaceAll("\\", "/");
}
