import type { JsonValue } from "@zsys/contracts";
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

export async function diagnostics(
  generation: ResolvedActiveGeneration,
  request: Request,
): Promise<JsonValue> {
  const activeItems = await diagnosticItems(generation.diagnostics);
  const candidateItems =
    generation.candidate === undefined
      ? undefined
      : await diagnosticItems(generation.candidate.diagnostics);
  const activePage = page(activeItems, request);
  const candidatePage = candidateItems === undefined ? undefined : page(candidateItems, request);
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
}

async function diagnosticItems(source: unknown): Promise<JsonValue[]> {
  const raw = await resolveCollection(source);
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
}

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
