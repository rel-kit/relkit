import { API_VERSION, type JsonValue } from "@relkit/contracts";
import {
  identity,
  isRecord,
  page,
  safeJson,
  safeSource,
  stringValue,
  type ResolvedActiveGeneration,
} from "./shared.js";
import { InspectorGraphError } from "./graph.js";

export function environmentMetadata(
  generation: ResolvedActiveGeneration,
  request: Request,
): JsonValue {
  const activeItems = environmentItems(generation.graph);
  if (activeItems === undefined)
    throw new InspectorGraphError("RELKIT_INSPECTOR_GRAPH_UNAVAILABLE", 503);
  const activePage = page(activeItems, request);
  const active = { ...identity(generation), role: "active", ...activePage };
  return {
    ...identity(generation),
    ...activePage,
    active,
  } as JsonValue;
}

function environmentItems(value: unknown): JsonValue[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return undefined;
  return value.nodes.flatMap((node) => environmentItem(node));
}

function environmentItem(value: unknown): JsonValue[] {
  if (!isRecord(value) || value.kind !== "env") return [];
  const name = stringValue(value.name) ?? stringValue(value.id);
  if (name === undefined) return [];
  const type = stringValue(value.type) ?? "unknown";
  const result: Record<string, unknown> = {
    name,
    type,
    requiredIn: Array.isArray(value.requiredIn)
      ? value.requiredIn.filter((item): item is string => typeof item === "string")
      : [],
    hasDefault: value.hasDefault === true,
    optional: value.optional === true,
    sensitive: value.sensitive === true || type === "secret-string",
  };
  for (const key of ["description"]) if (value[key] !== undefined) result[key] = value[key];
  const source = safeSource(value.source);
  if (source !== undefined) result.source = source;
  return [safeJson(result)];
}

export function candidateIdentity(
  generation: ResolvedActiveGeneration,
  role: "candidate",
): Record<string, JsonValue> {
  const candidate = generation.candidate;
  const activationFingerprint =
    candidate?.activationFingerprint ?? generation.activationFingerprint;
  return {
    protocol: "relkit.inspector",
    version: API_VERSION,
    role,
    generationId: candidate?.generationId ?? generation.generationId,
    graphHash: candidate?.graphHash ?? generation.graphHash,
    activeGenerationId: generation.generationId,
    activeGraphHash: generation.graphHash,
    ...(activationFingerprint === undefined
      ? {}
      : { activationFingerprint: safeJson(activationFingerprint) }),
    ...(candidate?.sourceVersion === undefined ? {} : { sourceVersion: candidate.sourceVersion }),
    ...(candidate?.state === undefined ? {} : { state: candidate.state }),
    ...(candidate?.status === undefined ? {} : { status: candidate.status }),
  };
}
