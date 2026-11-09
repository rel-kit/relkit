import { Effect } from "effect";
import type { RedactionPolicy } from "../redaction.js";
import {
  relativeSegmentPathEffect,
  scanObservabilitySegmentsEffect,
  segmentNameEffect,
  type IndexFileError,
} from "./index-files-effect.js";
import type { SegmentScanVisitor } from "./index-files.types.js";
export type { SegmentLine, SegmentScan, SegmentScanVisitor } from "./index-files.types.js";
export {
  IndexFileError,
  relativeSegmentPathEffect,
  scanObservabilitySegmentsEffect,
  segmentNameEffect,
} from "./index-files-effect.js";
/**
 * Scans valid segment records in stable filesystem order.
 * @param root - Segment storage root.
 * @param policy - Redaction policy applied before visiting records.
 * @param visitor - Callbacks for each segment and admitted line.
 * @returns Completion after all callbacks settle.
 * @throws {Error} If scanning or a visitor fails.
 * @example
 * await scanObservabilitySegments(root, policy, visitor);
 */
export function scanObservabilitySegments(
  root: string,
  policy: RedactionPolicy | undefined,
  visitor: SegmentScanVisitor,
): Promise<void> {
  return Effect.runPromise(
    scanObservabilitySegmentsEffect(root, policy, visitor).pipe(
      Effect.mapError((error: IndexFileError) =>
        error.cause instanceof Error ? error.cause : new Error(error.message),
      ),
    ),
  );
}
/**
 * Converts an absolute segment path to a portable relative path.
 * @param root - Segment root.
 * @param path - Absolute segment path.
 * @returns A slash-separated path.
 * @example
 * const name = relativeSegmentPath(root, path);
 */
export function relativeSegmentPath(root: string, path: string): string {
  return Effect.runSync(relativeSegmentPathEffect(root, path));
}
/**
 * Gets the basename of a segment path.
 * @param path - Segment path.
 * @returns The basename.
 * @example
 * const name = segmentName(path);
 */
export function segmentName(path: string): string {
  return Effect.runSync(segmentNameEffect(path));
}
