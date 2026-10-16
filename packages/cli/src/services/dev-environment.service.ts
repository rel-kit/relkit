/**
 * Resolves each candidate's dotenv values with Bun's own parser and expansion.
 * The Layer retains file-owned keys across deletions, removes their stale startup
 * values, and owns bounded helper processes through CliProcess. Values stay in
 * memory; failures retain safe diagnostics rather than dotenv or helper output.
 */
import { join } from "node:path";
import { parseEnv } from "node:util";
import { Context, Effect, Layer, Schema, Semaphore } from "effect";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { developmentEnvironmentFiles } from "../commands/dev-environment-files.js";
import { CliFileSystem, fileSystemLayer } from "./filesystem.service.js";
import { CliProcess, processLayer } from "./process.service.js";
import { developmentEnvironmentSchema } from "./dev-environment.schemas.js";
import type {
  DevEnvironmentOperations,
  DevelopmentEnvironment,
  DevelopmentEnvironmentState,
} from "./dev-environment.types.js";
import type { FileSystemCapabilities } from "./filesystem.types.js";

/** Per-invocation environment authority shared by ordinary and prepared candidate starts. */
export class CliDevEnvironment extends Context.Service<
  CliDevEnvironment,
  DevEnvironmentOperations
>()("relkit/cli/DevEnvironment", {
  /**
   * Captures native adapters and startup values once for this invocation.
   * @param inherited - Startup environment supplied by the executable or an isolated test.
   * @returns A serialized resolver retaining key ownership until its Layer closes.
   */
  make: (inherited: DevelopmentEnvironment = process.env) =>
    Effect.gen(function* () {
      const files = yield* CliFileSystem;
      const processes = yield* CliProcess;
      const baseline = yield* Effect.sync(() => ({ ...inherited }));
      const names = developmentEnvironmentFiles(baseline.NODE_ENV);
      const projects = new Map<string, Set<string>>();
      const serial = yield* Semaphore.make(1);
      const resolve = Effect.fn("DevEnvironment.resolve")((root: string) =>
        observeCli(
          "dev.environment.resolve",
          serial.withPermits(1)(
            Effect.suspend(() => {
              const managed = projects.get(root) ?? new Set<string>();
              projects.set(root, managed);
              return resolveDevelopmentEnvironment(root, {
                files,
                processes,
                baseline,
                names,
                managed,
              });
            }),
          ),
        ),
      );
      return { resolve } satisfies DevEnvironmentOperations;
    }),
}) {}

/** Supplies the resolver's native filesystem and joined subprocess authority. */
export const devEnvironmentLayer = Layer.effect(CliDevEnvironment, CliDevEnvironment.make()).pipe(
  Layer.provide(Layer.merge(fileSystemLayer, processLayer)),
);

/**
 * Loads current files with stale startup file values removed from the helper environment.
 * @param root - Current application directory.
 * @param state - Shared adapters and this project's retained key ownership.
 * @returns An in-memory snapshot with explicit deletions and bounded native lifetime.
 */
const resolveDevelopmentEnvironment = Effect.fn("DevEnvironment.load")(function* (
  root: string,
  state: DevelopmentEnvironmentState,
) {
  const { files, processes, baseline, names, managed } = state;
  const paths = yield* currentEnvironmentFiles(files, root, names, managed);
  const environment = { ...baseline };
  for (const key of managed) delete environment[key];
  const removed = Object.fromEntries([...managed].map((key) => [key, undefined]));
  // Unchanged empty projects retain the prepared startup path without another process.
  if (paths.length === 0) return { ...removed, ...environment };
  // Runtime flags belong to the application, never to this private parser process.
  const runtimeOptions = {
    BUN_OPTIONS: environment.BUN_OPTIONS,
    NODE_OPTIONS: environment.NODE_OPTIONS,
  };
  delete environment.BUN_OPTIONS;
  delete environment.NODE_OPTIONS;
  const output = yield* processes
    .run({
      command: process.execPath,
      args: [
        `--config=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
        "--no-env-file",
        ...paths.map((path) => `--env-file=${path}`),
        "--print",
        "JSON.stringify(process.env)",
      ],
      cwd: root,
      environment,
      maximumOutputBytes: 1_048_576,
    })
    .pipe(
      Effect.timeoutOrElse({
        duration: 3_000,
        orElse: () =>
          Effect.fail(
            cliAdapterError(
              "dev.environment.timeout",
              new Error("Development environment loading timed out."),
            ),
          ),
      }),
    );
  if (output.exitCode !== 0)
    return yield* Effect.fail(
      cliAdapterError(
        "dev.environment.load",
        new Error("Bun could not load the development environment."),
      ),
    );
  const current = yield* decodeEnvironment(output.stdout);
  return { ...removed, ...runtimeOptions, ...current };
});

/**
 * Records file-managed keys before loading values, retaining ownership after deletion.
 * @param files - Captured file adapter.
 * @param root - Current project directory.
 * @param names - Active standard dotenv filenames in precedence order.
 * @param managed - Session-owned union of previously observed keys.
 * @returns Existing files passed explicitly to Bun, or a typed file/parse failure.
 */
const currentEnvironmentFiles = Effect.fn("DevEnvironment.files")(function* (
  files: FileSystemCapabilities,
  root: string,
  names: readonly string[],
  managed: Set<string>,
) {
  const paths: string[] = [];
  for (const name of names) {
    const path = join(root, name);
    if (!(yield* files.exists(path))) continue;
    const metadata = yield* files.stat(path);
    if (metadata.size > 1_048_576)
      return yield* Effect.fail(
        cliAdapterError(
          "dev.environment.size",
          new Error("Development dotenv file exceeds the 1 MiB limit."),
        ),
      );
    const text = yield* files.readText(path);
    const keys = yield* cliTry("dev.environment.keys", () => Object.keys(parseEnv(text)));
    for (const key of keys) managed.add(key);
    paths.push(path);
  }
  return paths;
});

/**
 * Decodes private helper output with a constant diagnostic that cannot disclose values.
 * @param text - Bounded stdout returned by the owned Bun helper.
 * @returns Validated string values or a safe typed decoding failure.
 */
function decodeEnvironment(text: string) {
  return Effect.try({
    try: () => Schema.decodeUnknownSync(developmentEnvironmentSchema)(JSON.parse(text)),
    catch: () =>
      cliAdapterError(
        "dev.environment.decode",
        new Error("Invalid development environment response."),
      ),
  });
}
