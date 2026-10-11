/**
 * Selects finite preparation at the CLI composition edge. It uses the same
 * captured preparation service as staged creation and never acquires a session,
 * backend listener, inspector or persistent telemetry owner.
 */
import { resolve } from "node:path";
import { Effect, Layer } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { cliAdapterError, cliValidation } from "../cli-errors.js";
import { parseProjectArgs } from "../commands/project-args.js";
import type { CliCommandContext } from "../main-support-types.js";
import { SnapshotPreparation } from "./snapshot-preparation.service.js";
import { snapshotPreparationRuntime } from "./snapshot-preparation-runtime.js";
import { snapshotFilesLive } from "./snapshot-files.service.js";
import { readSnapshotTools } from "./snapshot-tools.js";

/** Finite-command service graph, shared through Layer memoization for one invocation. */
const preparationCommandLayer = Layer.merge(snapshotPreparationRuntime, snapshotFilesLive);

/**
 * Prepares installed source with one safe check and prints its published identity.
 * @param args - Established project flags including --prepare.
 * @param context - Borrowed cancellation and result presentation policy.
 * @returns Completion after all temporary preparation resources close.
 */
export function prepareSnapshotCommand(args: readonly string[], context: CliCommandContext) {
  return Effect.gen(function* () {
    const options = yield* cliValidation(() => parseProjectArgs(args, "dev"));
    const root = resolve(options.projectRoot ?? context.cwd ?? process.cwd());
    const tools = yield* readSnapshotTools(root);
    const preparation = yield* SnapshotPreparation;
    const result = yield* preparation.prepare({ projectRoot: root, tools, probe: "auto" });
    context.reporter.output(result, `Prepared development snapshot ${result.generation}.`);
  }).pipe(
    Effect.provide(preparationCommandLayer),
    mapErrorCause((error) => cliAdapterError("dev.prepare", error)),
  );
}
