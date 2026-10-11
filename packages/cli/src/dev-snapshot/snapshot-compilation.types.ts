/**
 * Defines preparation's safe compiler seam. One successful check result is passed
 * to bundling without repeating validation; accepted outputs remain owned by the
 * compiler/build APIs and are not serialized as arbitrary configuration objects.
 */
import type { Effect } from "effect";
import type { CheckResult } from "../commands/check-result.types.js";
import type { BuildResult } from "../commands/build.types.js";
import type { CliAdapterError } from "../cli-errors.js";
import type { DevSnapshot, SnapshotMember, SnapshotTools } from "./snapshot.types.js";

/** Original accepted check plus observations from that same TypeScript execution. */
export interface SnapshotCheckedCompilation extends CheckResult {
  readonly typecheckInputs: DevSnapshot["typecheckInputs"];
}

/** Replaceable finite checking/bundling authority, used only during preparation. */
export interface SnapshotCompilationOperations {
  readonly check: (
    root: string,
    inputs: readonly SnapshotMember[],
    tools: SnapshotTools,
  ) => Effect.Effect<SnapshotCheckedCompilation, CliAdapterError>;
  readonly buildChecked: (
    root: string,
    directory: string,
    checked: CheckResult,
  ) => Effect.Effect<BuildResult, CliAdapterError>;
}
