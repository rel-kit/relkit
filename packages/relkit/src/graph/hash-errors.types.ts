import type { JsonValueError, SourceLocationError } from "../contracts/index.js";
import type { GraphCanonicalizationError } from "./hash-errors.js";

/** Expected failures of graph canonicalization and hashing.
 * @remarks Other exceptions remain Effect defects.
 * @example function report(error: HashFailure): string { return error.message; }
 */
export type HashFailure = GraphCanonicalizationError | SourceLocationError | JsonValueError;
