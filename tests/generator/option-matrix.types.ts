/**
 * Shares normalized tuple inputs and deterministic file snapshots between matrix
 * tests. File content is base64 and mode is the POSIX permission mask; host paths
 * and timestamps are deliberately excluded from equality assertions.
 */
import type { CreateOptions } from "../../packages/create-relkit/src/options.js";
import type { GeneratedManifest } from "./option-matrix.schemas.js";

/** Runtime-equivalent creation flags varied by the matrix. */
export type CreationTuple = Pick<CreateOptions, "template" | "examples" | "install" | "git">;

/** Generated package fields decoded at the test boundary. */
export type GeneratedManifestValue = typeof GeneratedManifest.Type;

/** Deterministic generated file permission and byte content. */
export interface GeneratedFileSnapshot {
  readonly mode: number;
  readonly content: string;
}

/** Project-relative files, excluding native host identity. */
export type GeneratedProjectSnapshot = Record<string, GeneratedFileSnapshot>;
