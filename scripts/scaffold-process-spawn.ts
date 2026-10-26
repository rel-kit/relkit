/** Starts the exact closed native executable and child-only environment selected
 * by scaffold evidence. The neighboring process owner drains both streams and
 * owns detached-group termination; this leaf performs only native acquisition.
 */
import type { ScaffoldCommand } from "./scaffold-process.types.js";

/** Acquires the native child without installing or substituting an executable.
 * @param command - Exact executable, arguments, root and environment overrides.
 * @returns The real piped subprocess for scoped observation and release.
 */
export function spawnScaffoldProcess(command: ScaffoldCommand): Bun.ReadableSubprocess {
  const executable =
    command.executable === undefined || command.executable === "bun"
      ? globalThis.process.execPath
      : command.executable;
  return Bun.spawn([executable, ...command.args], {
    cwd: command.cwd,
    detached: true,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...globalThis.process.env,
      ...command.env,
      ...(command.registry === undefined
        ? {}
        : {
            BUN_CONFIG_REGISTRY: command.registry,
            npm_config_registry: command.registry,
          }),
      ...(command.cacheDir === undefined ? {} : { BUN_INSTALL_CACHE_DIR: command.cacheDir }),
    },
  });
}
