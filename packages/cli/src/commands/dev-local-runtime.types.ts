import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { LoadedLocalReconciler } from "./local-runtime-modules.types.js";

/** Public manually owned local-service lifetime, retaining the accepted project lease. */
export interface DevLocalServiceOwner {
  readonly applicationId: string;
  readonly overrideFile: string;
  readonly inspectorLease: Readonly<{
    readonly mode: "attached" | "detached";
    readonly status: "acquired" | "adopted" | "recovered";
  }>;
  readonly reconciler: LoadedLocalReconciler;
  /**
   * Releases reconciliation resources and this lease exactly once.
   * @returns Physical resource settlement before ownership release.
   */
  readonly close: () => Promise<void>;
}

/** Internal owner used by native Effect workflows; close is joined exactly once. */
export interface EffectLocalServiceOwner extends DevLocalServiceOwner {
  /** Joins the same exactly-once native owner without starting another runtime. */
  readonly closeEffect: Effect.Effect<void, CliAdapterError>;
}
