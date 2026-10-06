import type { ApplicationGraph, GraphDiff } from "@relkit/graph";
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Project-contained graph artifact selection. */
export interface GraphFileOptions {
  readonly projectRoot?: string;
  readonly graphPath?: string;
}
/** Validated graph bytes and their canonical identity. */
export interface GraphFile {
  readonly path: string;
  readonly graph: ApplicationGraph;
  readonly hash: string;
  readonly json: string;
}
/** Existing graph-print JSON contract. */
export interface GraphPrintResult {
  readonly ok: true;
  readonly command: "print";
  readonly graphPath: string;
  readonly graphHash: string;
  readonly graph: ApplicationGraph;
}
/** Existing graph-check JSON contract. */
export interface GraphCheckResult {
  readonly ok: true;
  readonly command: "check";
  readonly graphPath: string;
  readonly graphHash: string;
  readonly expectedHash?: string;
}
/** Existing graph-diff JSON contract. */
export interface GraphDiffResult extends GraphDiff {
  readonly ok: true;
  readonly command: "diff";
  readonly beforePath: string;
  readonly afterPath: string;
  readonly beforeHash: string;
  readonly afterHash: string;
}
/** Parsed graph subcommand; arguments remain a pure synchronous concern. */
export interface ParsedGraphArgs {
  readonly command: "print" | "check" | "diff";
  readonly paths: readonly string[];
  readonly expectedHash?: string;
  readonly projectRoot?: string;
}
/** Read-only graph authority; all filesystem access is captured by its Layer. */
export interface GraphFileOperations {
  /**
   * Reads and validates one artifact without evaluating application modules.
   * @param options - Project root and artifact selection.
   * @returns Lazy canonical bytes and identity, or a typed public graph failure.
   */
  readonly read: (options: GraphFileOptions) => Effect.Effect<GraphFile, CliAdapterError>;
  /**
   * Produces the existing print result from a validated artifact.
   * @param options - Artifact selection.
   * @returns Lazy immutable graph-print output.
   */
  readonly print: (options: GraphFileOptions) => Effect.Effect<GraphPrintResult, CliAdapterError>;
  /**
   * Validates an optional expected identity after loading the artifact.
   * @param options - Artifact selection and optional expected hash.
   * @returns Lazy graph-check output or the existing mismatch failure.
   */
  readonly check: (
    options: GraphFileOptions & { readonly expectedHash?: string },
  ) => Effect.Effect<GraphCheckResult, CliAdapterError>;
  /**
   * Compares artifacts in the established before/after order.
   * @param beforePath - Previous artifact path.
   * @param afterPath - Candidate artifact path.
   * @param options - Shared project root.
   * @returns Lazy changes and both canonical identities.
   */
  readonly diff: (
    beforePath: string,
    afterPath: string,
    options: Omit<GraphFileOptions, "graphPath">,
  ) => Effect.Effect<GraphDiffResult, CliAdapterError>;
}
