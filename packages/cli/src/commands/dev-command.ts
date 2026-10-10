/** Selects finite preparation or the scoped interactive dev session at the command edge. */
import { Effect } from "effect";
import { runCliEffect } from "../cli-runtime.js";
import { CliDev, devLiveLayer } from "../services/dev.service.js";
import type { CliCommandContext } from "../main-support-types.js";
import { prepareSnapshotCommand } from "../dev-snapshot/snapshot-prepare-command.js";

/**
 * Executes selected development work through one explicit native domain.
 * @param args - Existing dev flags.
 * @param context - Invocation cancellation and output policy.
 * @returns Completion after the session's resources have joined.
 */
export const runDevCommandEffect = Effect.fn("Dev.run")(
  (args: readonly string[], context: CliCommandContext) =>
    args.includes("--prepare")
      ? prepareSnapshotCommand(args, context)
      : CliDev.use((dev) => dev.run(args, context)),
);

/** Runs the native development command at its public Promise boundary.
 * @param args - Existing dev flags.
 * @param context - Native invocation context.
 * @returns Public completion after scoped shutdown.
 */
export function runDevCommand(args: readonly string[], context: CliCommandContext): Promise<void> {
  return runCliEffect(runDevCommandEffect(args, context), devLiveLayer(), context.signal);
}
