/** Shares validated GitHub identities and proposed data-file additions across the trusted preparation stages. */
import type { Schema } from "effect";
import type { PreparationPull, PreparationRun } from "./pr-automation.schemas.js";

/** Completed CI identity, decoded from GitHub rather than PR-controlled files. */
export type PreparationRunData = Schema.Schema.Type<typeof PreparationRun>;

/** Current open PR identity and exact branch heads. */
export type PreparationPullData = Schema.Schema.Type<typeof PreparationPull>;

/** One UTF-8 file proposal, never evaluated or extracted as executable code. */
export interface PreparedFile {
  readonly path: string;
  readonly content: string;
}
