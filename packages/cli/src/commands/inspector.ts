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
import { cliValidation } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { ContributorTerminal } from "../contributor-process.service.js";
import { fail, type CliCommandContext } from "../main-support.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import type { InspectorLaunch } from "./inspector.types.js";

/** Published package whose bin owns the UI, collector and local history. */
const INSPECTOR_PACKAGE = "@relkit/inspector";

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
 * Finds the `relkit-inspector` executable installed for one application by walking the
 * node_modules directories Node would search, so the lookup reads only the package
 * manifest and does not depend on the package exposing a resolvable main export.
 * @param projectRoot - Application root whose node_modules (or an ancestor's) owns the package.
 * @returns The absolute bin path. Fails with `RELKIT_INSPECTOR_MISSING` when no manifest is
 * found, or `RELKIT_INSPECTOR_INVALID` when an installed manifest does not declare the bin.
 */
const resolveInspectorBin = Effect.fn("Cli.inspector.resolveBin")(function* (projectRoot: string) {
  const files = yield* CliFileSystem;
  for (let directory = projectRoot; ; directory = dirname(directory)) {
    const path = join(directory, "node_modules", INSPECTOR_PACKAGE, "package.json");
    const text = yield* files.readText(path).pipe(Effect.option);
    if (Option.isSome(text)) {
      const manifest = yield* Schema.decodeUnknownEffect(InspectorManifest)(text.value).pipe(
        Effect.option,
      );
      if (Option.isNone(manifest))
        return yield* fail(
          "RELKIT_INSPECTOR_INVALID",
          `${path} does not declare the relkit-inspector bin. Reinstall ${INSPECTOR_PACKAGE}.`,
        );
      return resolve(dirname(path), manifest.value.bin["relkit-inspector"]);
    }
    if (dirname(directory) === directory) break;
  }
  return yield* fail(
    "RELKIT_INSPECTOR_MISSING",
    `${INSPECTOR_PACKAGE} is not installed in ${projectRoot}. Run \`relkit add inspector\` to enable inspection and install it locally.`,
  );
});
