/**
 * The CLI's view of the runtime it runs on: the `relkit/runtime` adapter, loaded once, and the
 * command line that runs a TypeScript or JavaScript entry point on the same runtime. On Bun the
 * entry runs directly; on Node it runs with the CLI's TypeScript hooks (`node/typescript-*`).
 */
import { loadRuntimeAdapter, type RuntimeAdapter } from "relkit/runtime";

/** Adapter of the runtime this CLI process runs on. */
export const runtime: RuntimeAdapter = await loadRuntimeAdapter();

/** Options for {@link scriptCommand}. */
export interface ScriptCommandOptions {
  /** Extra Bun flags placed before the entry, such as `--no-install`. */
  readonly bunFlags?: readonly string[];
}

/**
 * Builds the command that runs a module, including TypeScript sources, on this runtime.
 * @param entry - Absolute entry point path.
 * @param options - Runtime-specific flags.
 * @returns Executable and arguments; neither runtime loads `.env` files.
 */
export function scriptCommand(entry: string, options: ScriptCommandOptions = {}): string[] {
  if (runtime.name === "bun")
    return [process.execPath, "--no-env-file", ...(options.bunFlags ?? []), entry];
  return [...nodeTypeScriptFlags(), entry];
}

/**
 * Node executable and the flags that register the TypeScript hooks.
 * @returns `node --import <hooks>` without an entry.
 */
export function nodeTypeScriptFlags(): string[] {
  const register = new URL(
    import.meta.url.endsWith(".ts")
      ? "./node/typescript-register.ts"
      : "./node/typescript-register.js",
    import.meta.url,
  );
  return [process.execPath, "--disable-warning=ExperimentalWarning", "--import", register.href];
}

/**
 * Builds the command that runs a production server built for a runtime.
 * @param target - Runtime the server was built for.
 * @param entry - Absolute built entry point.
 * @returns This process's executable when it is that runtime, else `bun` or `node` from `PATH`.
 */
export function builtServerCommand(target: "bun" | "node", entry: string): string[] {
  if (target === "bun")
    return [
      runtime.name === "bun" ? process.execPath : "bun",
      "run",
      "--no-env-file",
      "--no-install",
      "--silent",
      entry,
    ];
  return [runtime.name === "node" ? process.execPath : "node", entry];
}

/**
 * The runtime a server is built for when `--runtime` is not given: the one this CLI runs on, so
 * `relkit dev` and `relkit build` under Node produce a Node server and Bun output is unchanged.
 * @returns `bun` or `node`.
 */
export function defaultBuildRuntime(): "bun" | "node" {
  return runtime.name;
}
