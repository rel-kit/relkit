/**
 * Environment of commands that run once (`db migrate`, `env check`, `env list`). Bun loads the
 * application's dotenv files into `process.env` before the CLI starts; Node loads none. On Node
 * this module reads the same files in the same order `relkit dev` uses (`.env`, `.env.<mode>`,
 * `.env.local` outside test, `.env.<mode>.local`) and lays them under the process environment, so
 * a value the process already has wins and the files only fill the gaps, as documented for
 * one-shot commands. Under Bun it returns the process environment unchanged, so nothing is applied
 * twice. File contents stay in memory; failures carry the file name, never its values.
 */
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { Effect } from "effect";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { developmentEnvironmentFiles } from "../commands/dev-environment-files.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { runtime } from "./index.js";
import type {
  OneShotEnvironmentFiles,
  OneShotEnvironmentOptions,
  OneShotEnvironmentValues,
} from "./one-shot-environment.types.js";

export type {
  OneShotEnvironmentFile,
  OneShotEnvironmentFiles,
  OneShotEnvironmentOptions,
  OneShotEnvironmentValues,
} from "./one-shot-environment.types.js";

/** Same bound as the development loader: larger dotenv files are refused. */
const MAXIMUM_FILE_BYTES = 1_048_576;

/**
 * Lists the environment files that apply to an application and whether this runtime loads them.
 * @param root - Application root holding the dotenv files.
 * @param options - Startup environment (its `NODE_ENV` selects the mode) and runtime overrides.
 * @returns Lazily, every candidate with its existence, lowest precedence first; requires
 * CliFileSystem and never reads file contents.
 * @example
 * ```ts
 * const { loadedByRuntime, files } = yield* oneShotEnvironmentFiles("/app");
 * // On Node: loadedByRuntime === false; files[0].name === ".env"
 * ```
 */
export const oneShotEnvironmentFiles = Effect.fn("OneShotEnvironment.files")(function* (
  root: string,
  options: OneShotEnvironmentOptions = {},
) {
  const files = yield* CliFileSystem;
  const selected = options.runtime ?? runtimeName();
  const names = developmentEnvironmentFiles((options.inherited ?? process.env).NODE_ENV);
  const candidates = yield* Effect.forEach(names, (name) => {
    const path = join(resolve(root), name);
    return files.exists(path).pipe(Effect.map((exists) => ({ name, path, exists })));
  });
  return {
    runtime: selected,
    loadedByRuntime: selected === "bun",
    files: candidates,
  } satisfies OneShotEnvironmentFiles;
});

/**
 * Resolves the environment a one-shot command runs with.
 * @param root - Application root holding the dotenv files.
 * @param options - Startup environment and runtime overrides.
 * @returns Lazily, the inherited environment unchanged when the runtime loaded the files (Bun),
 * otherwise the file values in precedence order overlaid by every defined inherited value.
 * Fails with CliAdapterError naming the file when one is unreadable, too large or malformed.
 * @example
 * ```ts
 * // .env holds DATABASE_URL=postgres://localhost/app and the shell sets nothing.
 * const environment = yield* oneShotEnvironment("/app");
 * // On Node: environment.DATABASE_URL === "postgres://localhost/app"
 * ```
 */
export const oneShotEnvironment = Effect.fn("OneShotEnvironment.resolve")(
  function* (root: string, options: OneShotEnvironmentOptions = {}) {
    const inherited = options.inherited ?? process.env;
    const plan = yield* oneShotEnvironmentFiles(root, options);
    if (plan.loadedByRuntime) return { ...inherited } as OneShotEnvironmentValues;
    const fromFiles: Record<string, string> = {};
    for (const file of plan.files) {
      if (!file.exists) continue;
      Object.assign(fromFiles, yield* readEnvironmentFile(file.path, file.name));
    }
    // Process values win: only keys the process lacks are filled from the files.
    const merged: Record<string, string | undefined> = { ...fromFiles };
    for (const [key, value] of Object.entries(inherited))
      if (value !== undefined) merged[key] = value;
    return merged as OneShotEnvironmentValues;
  },
  (effect, root) =>
    observeCli("oneShotEnvironment.resolve", effect.pipe(Effect.annotateLogs({ root }))),
);

/**
 * Reads and parses one dotenv file with Node's parser, the one `node --env-file` uses.
 * @param path - Existing file.
 * @param name - File name used in diagnostics.
 * @returns Lazily, the parsed key/value pairs, or a CliAdapterError naming the file.
 */
const readEnvironmentFile = Effect.fn("OneShotEnvironment.readFile")(function* (
  path: string,
  name: string,
) {
  const files = yield* CliFileSystem;
  const metadata = yield* files.stat(path);
  if (metadata.size > MAXIMUM_FILE_BYTES)
    return yield* Effect.fail(
      cliAdapterError("oneShotEnvironment.size", new Error(`${name} exceeds the 1 MiB limit.`)),
    );
  const text = yield* files.readText(path);
  return yield* cliTry("oneShotEnvironment.parse", () => parseEnv(text)).pipe(
    Effect.mapError(() =>
      cliAdapterError("oneShotEnvironment.parse", new Error(`${name} could not be parsed.`)),
    ),
  );
});

/**
 * Names the runtime this CLI runs on.
 * @returns `bun` under Bun, otherwise `node`.
 */
function runtimeName(): "bun" | "node" {
  return runtime.name === "bun" ? "bun" : "node";
}
