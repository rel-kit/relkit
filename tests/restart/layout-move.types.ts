/** Describes the captured native Docker capability used only by the opt-in source-move schedule fixture. */
import type { Effect } from "effect";
import type { CliAdapterError } from "../../packages/cli/src/cli-errors.js";
import type { ScaffoldProcessFailure } from "../../scripts/scaffold-process.errors.js";

/** Scoped Docker invocation retaining native command failure and a narrowly defined absent-owned-resource removal result. */
export type RestartDocker = (
  args: readonly string[],
  removal?: boolean,
) => Effect.Effect<string, CliAdapterError | ScaffoldProcessFailure>;
