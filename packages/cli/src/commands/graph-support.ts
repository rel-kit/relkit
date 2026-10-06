import { Effect } from "effect";
import { runCliEffect } from "../cli-runtime.js";
import { CliGraphFiles, graphFilesLayer } from "./graph-file.service.js";
import type {
  GraphFileOptions,
  GraphPrintResult,
  GraphCheckResult,
  GraphDiffResult,
} from "./graph.types.js";

export { GraphCommandError } from "./graph-error.js";
export type {
  GraphFileOptions,
  GraphPrintResult,
  GraphCheckResult,
  GraphDiffResult,
} from "./graph.types.js";

/**
 * Reads through caller-supplied graph authority.
 * @param options - Artifact selection.
 * @returns Lazy canonical bytes requiring CliGraphFiles.
 */
export const readGraphFileEffect = Effect.fn("Graph.read")((options: GraphFileOptions = {}) =>
  CliGraphFiles.use((graphs) => graphs.read(options)),
);

/**
 * Reads a graph at the existing Promise boundary.
 * @param options - Artifact selection.
 * @returns Canonical bytes without evaluating application modules.
 */
export function readGraphFile(options: GraphFileOptions = {}) {
  return runCliEffect(readGraphFileEffect(options), graphFilesLayer);
}

/**
 * Produces print output through the supplied service.
 * @param options - Artifact selection.
 * @returns Lazy immutable print output.
 */
export const printGraphEffect = Effect.fn("Graph.print")((options: GraphFileOptions = {}) =>
  CliGraphFiles.use((graphs) => graphs.print(options)),
);

/**
 * Prints a graph at its established Promise boundary.
 * @param options - Artifact selection.
 * @returns Immutable public graph-print output.
 */
export function printGraph(options: GraphFileOptions = {}): Promise<GraphPrintResult> {
  return runCliEffect(printGraphEffect(options), graphFilesLayer);
}

/**
 * Checks identity through caller-supplied graph authority.
 * @param options - Artifact selection and optional expected hash.
 * @returns Lazy graph-check output or typed hash failure.
 */
export const checkGraphEffect = Effect.fn("Graph.check")(
  (options: GraphFileOptions & { readonly expectedHash?: string } = {}) =>
    CliGraphFiles.use((graphs) => graphs.check(options)),
);

/**
 * Checks identity at the established Promise boundary.
 * @param options - Artifact selection and optional expected hash.
 * @returns Immutable public graph-check output.
 */
export function checkGraph(
  options: GraphFileOptions & { readonly expectedHash?: string } = {},
): Promise<GraphCheckResult> {
  return runCliEffect(checkGraphEffect(options), graphFilesLayer);
}

/**
 * Diffs artifacts through caller-supplied authority.
 * @param beforePath - Previous artifact path.
 * @param afterPath - Candidate artifact path.
 * @param options - Shared project root.
 * @returns Lazy compatibility changes.
 */
export const diffGraphFilesEffect = Effect.fn("Graph.diff")(
  (beforePath: string, afterPath: string, options: Omit<GraphFileOptions, "graphPath"> = {}) =>
    CliGraphFiles.use((graphs) => graphs.diff(beforePath, afterPath, options)),
);

/**
 * Diffs artifacts at the established Promise boundary.
 * @param beforePath - Previous artifact path.
 * @param afterPath - Candidate artifact path.
 * @param options - Shared project root.
 * @returns Immutable public graph-diff output.
 */
export function diffGraphFiles(
  beforePath: string,
  afterPath: string,
  options: Omit<GraphFileOptions, "graphPath"> = {},
): Promise<GraphDiffResult> {
  return runCliEffect(diffGraphFilesEffect(beforePath, afterPath, options), graphFilesLayer);
}
