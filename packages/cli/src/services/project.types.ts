import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { CheckOptions } from "../commands/check.types.js";
import type { CheckResult } from "../commands/check-result.types.js";
import type { BuildOptions, BuildResult } from "../commands/build.types.js";
import type { DevCheckRequest } from "../commands/dev-check.types.js";

/** Project compilation and build workflows with narrow, captured execution authority. */
export interface ProjectCapabilities {
  /**
   * Checks one authored project without activating a failed graph.
   * @param options - Compiler inputs and generation identity.
   * @returns Lazy deterministic check diagnostics; defects and interruption escape.
   */
  readonly check: (options?: CheckOptions) => Effect.Effect<CheckResult>;

  /**
   * Checks development inputs in a scoped compiler process so cancellation remains responsive.
   * @param request - Project root and fresh compilation identity.
   * @returns Validated diagnostics after the compiler and its descendants have exited.
   * @remarks Interruption kills and joins the owned process group; transport failures stay typed.
   */
  readonly checkDevelopment: (
    request: DevCheckRequest,
  ) => Effect.Effect<CheckResult, CliAdapterError>;

  /**
   * Builds and atomically activates one complete cohort.
   * @param options - Build roots and optional foreign check compatibility adapter.
   * @returns Lazy build diagnostics or an expected foreign adapter failure.
   */
  readonly build: (options?: BuildOptions) => Effect.Effect<BuildResult, CliAdapterError>;
}
