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
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { inspectorExecution } from "./execution.js";
import { projectionAttempt, runInspectorSync } from "./native-edge.js";

/**
 * Projects environment declarations and active/candidate deployment evidence without revealing values.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns Bounded environment metadata with sensitive values omitted.
 */
function environmentMetadataValue(
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

/**
 * Observes selective environment projection independently of HTTP ingress.
 * @param generation - Authorized generation supplying stored environment declarations.
 * @param request - Bounded environment filters and pagination request.
 * @returns Lazy public environment metadata or a typed compatibility failure.
 */
export const environmentMetadataEffect = Effect.fn("Inspector.environmentMetadata")(
  (generation: ResolvedActiveGeneration, request: Request) =>
    projectionAttempt(() => environmentMetadataValue(generation, request)),
  (effect) => observeExecution("inspector", "environmentMetadata", effect),
);

/**
 * Runs environment projection on the reused synchronous compatibility owner.
 * @param generation - Authorized active generation.
 * @param request - Bounded environment filters and pagination request.
 * @returns The existing redacted public environment response.
 */
export function environmentMetadata(
  generation: ResolvedActiveGeneration,
  request: Request,
): JsonValue {
  return runInspectorSync(inspectorExecution, environmentMetadataEffect(generation, request));
}

/**
 * Selects environment declaration nodes without traversing runtime providers.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public environment metadata in declaration order.
 */
function environmentItems(value: unknown): JsonValue[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return undefined;
  return value.nodes.flatMap((node) => environmentItem(node));
}

/**
 * Selects one environment declaration and masks sensitive or default values.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Redacted environment metadata.
 */
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

/**
 * Projects candidate identity separately from the active generation identity.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param role - The candidate identity role; active identity remains separate.
 * @returns Available candidate metadata without inventing an active identity.
 */
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
