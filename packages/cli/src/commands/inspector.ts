/**
 * Runs the project-local `@relkit/inspector` UI for `relkit inspector`, so
 * inspection needs neither a global install nor a separate `bunx` invocation.
 * The package is resolved from the application root (installed there by
 * `relkit add inspector`) and its `relkit-inspector` bin is started with the
 * caller's terminal through ContributorTerminal, which owns the process group
 * and terminates it when the invocation is interrupted. A missing package is a
 * typed CliFailureError with install guidance; inspector exit codes pass through.
 */
import { dirname, join, resolve } from "node:path";
import { Effect, Option, Schema } from "effect";
import { cliTry, cliValidation } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { ContributorTerminal } from "../contributor-process.service.js";
import { fail, type CliCommandContext } from "../main-support.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import type { InspectorLaunch } from "./inspector.types.js";

/** Published package whose bin owns the UI, collector and local history. */
const INSPECTOR_PACKAGE = "@relkit/inspector";

/** Package directories walked upward from the resolved entry before giving up. */
const MAX_PACKAGE_DEPTH = 4;

/** The fields of the inspector's package.json that locate its executable. */
const InspectorManifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.Literal(INSPECTOR_PACKAGE),
    bin: Schema.Struct({ "relkit-inspector": Schema.String }),
  }),
);

/**
 * Launches the inspector UI and waits for it to exit.
 * @param args - Normalized `--project-root`, `--port` and `--hostname` pairs from the parser.
 * @param context - Invocation context supplying the working directory.
 * @returns The inspector's exit status. Fails with `RELKIT_INSPECTOR_MISSING` when the
 * package is not installed in the application; requires ContributorTerminal and CliFileSystem.
 */
export const runInspectorEffect = Effect.fn("Cli.inspector")(
  function* (args: readonly string[], context: CliCommandContext) {
    const launch = yield* cliValidation(() => inspectorLaunch(args, context.cwd ?? process.cwd()));
    const bin = yield* resolveInspectorBin(launch.projectRoot);
    const terminal = yield* ContributorTerminal;
    return yield* terminal.run(
      [process.execPath, bin, "--project-root", launch.projectRoot, ...launch.forwarded],
      launch.projectRoot,
    );
  },
  (effect) => observeCli("inspector.run", effect),
);

/**
 * Splits parser output into the application root and flags forwarded verbatim.
 * @param args - Flag/value pairs emitted by cli-command-inspector.ts.
 * @param cwd - Directory that a relative `--project-root` is resolved against.
 * @returns The absolute application root and the UI flags owned by relkit-inspector,
 * which validates their values itself.
 */
function inspectorLaunch(args: readonly string[], cwd: string): InspectorLaunch {
  const forwarded: string[] = [];
  let projectRoot = ".";
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (value === undefined) throw fail("RELKIT_INSPECTOR_USAGE", `${name} requires a value.`, 2);
    if (name === "--project-root") projectRoot = value;
    else forwarded.push(name!, value);
  }
  return { projectRoot: resolve(cwd, projectRoot), forwarded };
}

/**
 * Finds the `relkit-inspector` executable installed for one application.
 * @param projectRoot - Application root whose node_modules owns the package.
 * @returns The absolute bin path, or `RELKIT_INSPECTOR_MISSING` when it is not resolvable.
 */
const resolveInspectorBin = Effect.fn("Cli.inspector.resolveBin")(function* (projectRoot: string) {
  const entry = yield* cliTry("inspector.resolve", () =>
    Bun.resolveSync(INSPECTOR_PACKAGE, projectRoot),
  ).pipe(Effect.option);
  const bin = Option.isNone(entry) ? undefined : yield* packageBin(dirname(entry.value));
  if (bin !== undefined) return bin;
  return yield* fail(
    "RELKIT_INSPECTOR_MISSING",
    `${INSPECTOR_PACKAGE} is not installed in ${projectRoot}. Run \`relkit add inspector\` to enable inspection and install it locally.`,
  );
});

/**
 * Walks up from the package entry to the manifest that declares the bin.
 * @param start - Directory containing the resolved package entry module.
 * @returns The absolute bin path, or undefined when no matching manifest is found nearby.
 */
const packageBin = Effect.fn("Cli.inspector.packageBin")(function* (start: string) {
  const files = yield* CliFileSystem;
  let directory = start;
  for (let depth = 0; depth < MAX_PACKAGE_DEPTH; depth += 1) {
    const manifest = yield* files
      .readText(join(directory, "package.json"))
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(InspectorManifest)), Effect.option);
    if (Option.isSome(manifest)) return resolve(directory, manifest.value.bin["relkit-inspector"]);
    directory = dirname(directory);
  }
  return undefined;
});
