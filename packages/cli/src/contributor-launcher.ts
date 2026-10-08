import { join, relative } from "node:path";
import { Effect, Layer } from "effect";
import { runCli } from "./main.js";
import { contributorCallback } from "./contributor-callback.js";
import { observeCli } from "./cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "./services/filesystem.service.js";
import { ContributorTerminal, contributorTerminalLayer } from "./contributor-process.service.js";

/**
 * Selects the installed CLI or contributor sync launcher without loading workspace services.
 * @param root - Repository candidate beside this executable.
 * @param cwd - Caller's native working directory.
 * @param args - Literal forwarded CLI arguments.
 * @param signal - Borrowed executable signal preserving native SIGINT/SIGTERM diagnostics.
 * @returns Existing native status; inherited streams stay caller-owned.
 */
export const contributorLauncherEffect = Effect.fn("ContributorLauncher.run")(
  function* (root: string, cwd: string, args: readonly string[], signal?: AbortSignal) {
    const files = yield* CliFileSystem;
    const terminal = yield* ContributorTerminal;
    const launcher = join(root, "scripts/relkit-local.ts");
    const location = relative(root, cwd).replaceAll("\\", "/");
    const workspace = location === "" || /^(?:apps|examples|packages)(?:\/|$)/.test(location);
    if (!(yield* files.exists(launcher)) || workspace)
      return yield* contributorCallback(
        "contributor.main",
        (owned) => runCli(args, { signal: owned, installSignalHandlers: false }),
        signal,
      );
    return yield* terminal.run([process.execPath, launcher, ...args], cwd);
  },
  (effect) => observeCli("contributor.launcher", effect),
);

/** Stateless native entry adapters, acquired once by the executable edge. */
export const contributorLauncherLayer = Layer.mergeAll(fileSystemLayer, contributorTerminalLayer);
