/**
 * Retains native resolution failures separately from aggregate selected-package
 * diagnostics. An unreadable manifest is never mislabeled as a missing SDK;
 * initialization failures remain with the executable module owner.
 */
import { Data } from "effect";
import type { DependencyDiagnostic } from "./dependency-preflight.types.js";

/** Read-only resolution failed for an installed package or invalid native input. */
export class DependencyResolutionFailure extends Data.TaggedError("DependencyResolutionFailure")<{
  /** Requested package identity used to locate its manifest. */
  readonly package: string;
  /** Consumer/adapter directory used for this resolution attempt. */
  readonly from: string;
  /** Native or schema failure; its Error.cause preserves the original rejection. */
  readonly cause: Error;
}> {}

/** Several safely discovered missing/incompatible requirements, with no installation side effect. */
export class SelectedDependencyFailure extends Data.TaggedError("SelectedDependencyFailure")<{
  /** Stable missing/version diagnostics in deterministic package order. */
  readonly diagnostics: readonly DependencyDiagnostic[];
}> {
  override get message(): string {
    return this.diagnostics
      .map(
        (entry) =>
          `${entry.code}: ${entry.package}@${entry.supportedRange} (${entry.capabilities.join(", ")}); installed: ${entry.installedVersion ?? "absent"}. Install: ${entry.install}`,
      )
      .join("\n");
  }
}

/** A selected module failed after its presence and supported version were checked. */
export class SelectedDependencyInitializationFailure extends Data.TaggedError(
  "SelectedDependencyInitializationFailure",
)<{
  readonly package: string;
  readonly cause: Error;
}> {
  readonly code = "RELKIT_DEPENDENCY_INITIALIZATION_FAILED";
  override get message(): string {
    return `${this.code}: ${this.package}: ${this.cause.message}`;
  }
}
