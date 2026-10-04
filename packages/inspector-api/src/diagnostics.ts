import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "./native-edge.js";
import { inspectorExecution } from "./execution.js";
import { nativeAttempt, projectionAttempt } from "./native-edge.js";
import type { JsonValue } from "@relkit/contracts";
import {
  identity,
  isRecord,
  page,
  pick,
  resolveCollection,
  safeJson,
  safeSource,
  type ResolvedActiveGeneration,
} from "./shared.js";
import { candidateIdentity } from "./environment.js";
import { toItems } from "./graph-utils.js";

const DIAGNOSTIC_FIELDS = [
  "code",
  "severity",
  "message",
  "occurredAt",
  "file",
  "line",
  "column",
  "descriptorId",
  "related",
  "suggestion",
  "documentationPath",
] as const;

/**
 * Combines active and candidate diagnostic pages without exposing private declaration fields.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A lazy observed Effect containing bounded diagnostics with their existing active/candidate identities.
 */
export const diagnosticsEffect = Effect.fn("Inspector.diagnostics")(
  function* (generation: ResolvedActiveGeneration, request: Request) {
    const activeItems = yield* diagnosticItemsEffect(generation.diagnostics);
    const candidateItems =
      generation.candidate === undefined
        ? undefined
        : yield* diagnosticItemsEffect(generation.candidate.diagnostics);
    const activePage = yield* projectionAttempt(() => page(activeItems, request));
    const candidatePage =
      candidateItems === undefined
        ? undefined
        : yield* projectionAttempt(() => page(candidateItems, request));
    const visible = candidatePage ?? activePage;
    const active = { ...identity(generation), role: "active", ...activePage };
    const candidate =
      candidatePage === undefined
        ? undefined
        : { ...candidateIdentity(generation, "candidate"), ...candidatePage };
    return {
      ...identity(generation),
      ...visible,
      status: candidate === undefined ? "active" : "candidate",
      active,
      ...(candidate === undefined ? {} : { candidate }),
    } as JsonValue;
  },
  (effect) => observeExecution("inspector", "diagnostics", effect),
);

/**
 * Combines active and candidate diagnostic pages without exposing private declaration fields.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Bounded diagnostics with their existing active/candidate identities.
 */
export function diagnostics(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, diagnosticsEffect(generation, request));
}

/**
 * Resolves one native diagnostics source and selects only public diagnostic locations and fields.
 * @param source - Native or stored source whose public value is resolved selectively.
 * @returns A lazy observed Effect containing redacted public diagnostics in source order.
 */
const diagnosticItemsEffect = Effect.fn("Inspector.diagnosticItems")(
  function* (source: unknown) {
    const raw = yield* nativeAttempt(() => resolveCollection(source));
    return toItems(raw).flatMap((value) => {
      if (!isRecord(value)) return [];
      const result = pick(value, DIAGNOSTIC_FIELDS);
      const sourceLocation = safeSource(result);
      if (isRecord(sourceLocation)) {
        result.file = sourceLocation.file;
        result.line = sourceLocation.line;
        result.column = sourceLocation.column;
      } else {
        delete result.file;
        delete result.line;
        delete result.column;
      }
      if (Array.isArray(result.related)) {
        result.related = result.related.flatMap((entry) => relatedLocation(entry));
      }
      return [safeJson(result)];
    });
  },
  (effect) => observeExecution("inspector", "diagnosticItems", effect),
);

/**
 * Projects only safe locations and declared relation messages.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Zero or one public related-location records.
 */
function relatedLocation(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) return [];
  const source = safeSource(value);
  if (!isRecord(source)) return [];
  return [
    {
      ...source,
      ...pick(value, ["message", "descriptorId"]),
    },
  ];
}
