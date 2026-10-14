/** Captures exact installed executable and registry authority for one outside-workspace scaffold acceptance run. */
import type { Effect } from "effect";
import type { ScaffoldProcess } from "./scaffold-process.js";

/** Captured native command operation; each invocation owns its child and drains. */
export type PackedCommand = Effect.Success<typeof ScaffoldProcess.make>["run"];
/** Installed candidate identity shared by direct and CLI consumer flows. */
export interface PackedScaffoldFixture {
  /** Scope-owned outside-workspace parent of the generated projects. */
  readonly temporary: string;
  /** Scope-owned registry serving only verified candidate first-party packages. */
  readonly registry: string;
  /** Isolated Bun installation cache. */
  readonly cacheDir: string;
  /** Actual installed create-relkit executable. */
  readonly createBin: string;
  /** Actual installed relkit executable. */
  readonly relkitBin: string;
}
