/**
 * Defines owned native bundler fixtures for optional-peer acceptance. Their Effect
 * operations use the caller's process authority and temporary-directory Scope;
 * no child or symlink outlives an individual test fixture.
 */
import type { Effect } from "effect";
import type { CliProcess } from "./src/services/process.service.js";
import type { CliAdapterError } from "./src/cli-errors.js";
import type { ProcessOutput } from "./src/services/process.types.js";

/** Isolated helper/runtime roots with finite real Bun build/execute operations. */
export interface BuildSupportFixture {
  readonly root: string;
  readonly modules: string;
  readonly server: string;
  readonly build: (
    development: boolean,
  ) => Effect.Effect<ProcessOutput, CliAdapterError, CliProcess>;
  readonly prepare: () => Effect.Effect<ProcessOutput, CliAdapterError, CliProcess>;
}
