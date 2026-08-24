import { type DescriptorKind, type JsonValue, type SourceLocation } from "@zsys/contracts";
import type { Diagnostic } from "@zsys/diagnostics";
import type {
  EvaluatorModuleResult,
  EvaluatorResponse,
  EvaluatorManifestReference,
} from "./discovery/evaluator-protocol.js";
import type { ExtractedDescriptor } from "./discovery/extract.js";
import type {
  ExportFact,
  ExportFacts,
  SourceMapEntry,
  SourceMapSource,
} from "./discovery/source-map.js";
import type { WatchDependencyIndex } from "./watch.js";
import type {
  GraphEdge,
  GraphNode,
  NormalizedGraph,
  ObservedEdge,
} from "./normalize-graph-types.js";

export type {
  GraphEdge,
  GraphNode,
  NormalizedGraph,
  ObservedEdge,
} from "./normalize-graph-types.js";
export type {
  GenerationIdentity,
  NormalizationSource,
  RuntimeReference,
} from "./normalize-public-types.js";

/** Stable diagnostics emitted by the normalization stage. */
export const NORMALIZE_CODES = Object.freeze({
  descriptor: "ZSYS_DESCRIPTOR_INVALID",
  id: "ZSYS_ID_INVALID",
  method: "ZSYS_METHOD_INVALID",
  path: "ZSYS_PATH_INVALID",
  routeFile: "ZSYS_ROUTE_FILE_REQUIRED",
  routeExport: "ZSYS_ROUTE_EXPORT_METHOD",
  routeTransport: "ZSYS_ROUTE_LEGACY_TRANSPORT",
  reservedRoute: "ZSYS_ROUTE_RESERVED_PATH",
  rateLimit: "ZSYS_RATE_LIMIT_INVALID",
  rateLimitStore: "ZSYS_RATE_LIMIT_STORE_REQUIRED",
  rateLimitReference: "ZSYS_RATE_LIMIT_STORE_INVALID",
  profile: "ZSYS_PROFILE_INVALID",
  schedule: "ZSYS_SCHEDULE_INVALID",
  retry: "ZSYS_RETRY_INVALID",
  idempotency: "ZSYS_IDEMPOTENCY_INVALID",
  schema: "ZSYS_SCHEMA_UNAVAILABLE",
  missingTarget: "ZSYS_MISSING_TARGET",
  missingMiddleware: "ZSYS_MISSING_MIDDLEWARE",
  missingTransform: "ZSYS_MISSING_TRANSFORM",
  transformCollision: "ZSYS_TRANSFORM_ID_COLLISION",
  duplicateId: "ZSYS_DUPLICATE_ID",
  mapping: "ZSYS_MAPPING_INCOMPATIBLE",
  middlewareInput: "ZSYS_MIDDLEWARE_INPUT_INCOMPATIBLE",
  middlewareOutput: "ZSYS_MIDDLEWARE_OUTPUT_INCOMPATIBLE",
  response: "ZSYS_ROUTE_RESPONSE_INCOMPATIBLE",
  jobInput: "ZSYS_JOB_INPUT_INCOMPATIBLE",
  selector: "ZSYS_EVENT_SELECTOR_EMPTY",
  eventName: "ZSYS_EVENT_NAME_UNKNOWN",
  eventListenerId: "ZSYS_EVENT_LISTENER_ID_REQUIRED",
  wildcard: "ZSYS_EVENT_WILDCARD_RESTRICTED",
  eventTarget: "ZSYS_EVENT_TARGET_INCOMPATIBLE",
  toolTarget: "ZSYS_TOOL_TARGET_INCOMPATIBLE",
  agentTool: "ZSYS_AGENT_TOOL_INVALID",
  model: "ZSYS_MODEL_SELECTOR_INVALID",
  modelProvider: "ZSYS_MODEL_PROVIDER_UNKNOWN",
  modelDefault: "ZSYS_MODEL_PROVIDER_DEFAULT_MISSING",
  modelConfiguration: "ZSYS_MODEL_PROVIDER_CONFIGURATION_INVALID",
  providerProfile: "ZSYS_PROVIDER_PROFILE_UNKNOWN",
  bucketProfileDuplicate: "ZSYS_BUCKET_PROFILE_DUPLICATE",
  identityAmbiguous: "ZSYS_ID_INFERENCE_AMBIGUOUS",
  source: "ZSYS_SOURCE_LOCATION_INVALID",
  collision: "ZSYS_ROUTE_COLLISION",
  handler: "ZSYS_MANIFEST_HANDLER_MISSING",
} as const);

/** The ordered pass names required by v3 Section 11.4. */
export const VALIDATION_PASSES = Object.freeze([
  "extract descriptor values",
  "assign source locations",
  "normalize IDs, paths, methods, profiles, models, and schedules",
  "validate descriptor-local fields",
  "build stable reference index",
  "resolve target references",
  "validate schema availability and JSON Schema generation",
  "validate route mapping compatibility",
  "validate job input compatibility",
  "expand event selectors",
  "validate event target compatibility",
  "validate tool target compatibility",
  "validate agent tools and model selectors",
  "validate provider profiles",
  "detect route collisions",
  "sort graph nodes and edges",
  "produce hash and generated outputs",
] as const);

export type ValidationPass = (typeof VALIDATION_PASSES)[number];
export interface NormalizeInput {
  readonly descriptors?: readonly unknown[];
  readonly observedEdges?: readonly ObservedEdge[];
  readonly extracted?: readonly ExtractedDescriptor[];
  readonly evaluator?: EvaluatorResponse | readonly EvaluatorModuleResult[];
  readonly modules?: readonly EvaluatorModuleResult[];
  readonly projectRoot?: string;
  readonly generationId?: string;
  readonly mode?: "development" | "test" | "production";
  readonly sources?: readonly SourceMapSource[];
  readonly sourceMap?: readonly SourceMapEntry[];
  readonly locations?:
    ReadonlyMap<string, SourceLocation> | Readonly<Record<string, SourceLocation>>;
  readonly onPass?: (pass: ValidationPass, index: number) => void;
}
export interface NormalizedDescriptor {
  readonly kind: string;
  readonly id: string;
  readonly source: SourceLocation;
  readonly exportName: string;
  readonly exportKind: "default" | "named";
  readonly identity?: "explicit" | "inferred";
  readonly facts?: ExportFacts;
  readonly exportFact?: ExportFact;
  readonly reference?: EvaluatorManifestReference;
  readonly value: unknown;
}
export interface GeneratedOutputs {
  readonly graph: string;
  readonly manifest: string;
  readonly diagnostics: string;
  readonly openapi: string;
  readonly client: string;
}

export interface NormalizationResult {
  readonly passOrder: readonly ValidationPass[];
  readonly diagnostics: readonly Diagnostic[];
  readonly descriptors: readonly NormalizedDescriptor[];
  readonly references: ReadonlyMap<string, NormalizedDescriptor>;
  readonly observedEdges: readonly ObservedEdge[];
  readonly graph?: NormalizedGraph;
  readonly graphHash?: string;
  readonly outputs: GeneratedOutputs;
  readonly watch: WatchDependencyIndex;
  readonly activatable: boolean;
}

export interface NormalizationWork {
  readonly input: NormalizeInput;
  descriptors: NormalizedDescriptor[];
  references: Map<string, NormalizedDescriptor>;
  referencesByKind: Map<string, Map<string, NormalizedDescriptor>>;
  middlewareReferences: Map<string, NormalizedDescriptor>;
  transformReferences: Map<string, NormalizedDescriptor>;
  schemas: Map<string, JsonValue>;
  selectorExpansions: Map<string, readonly string[]>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  observedEdges: ObservedEdge[];
  diagnostics: Diagnostic[];
  passOrder: ValidationPass[];
  graph?: NormalizedGraph;
  graphHash?: string;
  outputs: GeneratedOutputs;
}

export function isDescriptorKindValue(value: string): value is DescriptorKind {
  return [
    "app",
    "function",
    "middleware",
    "service",
    "route",
    "job",
    "event",
    "event-trigger",
    "bucket",
    "cache",
    "tool",
    "agent",
  ].includes(value as DescriptorKind);
}

export const EMPTY_OUTPUTS: GeneratedOutputs = Object.freeze({
  graph: "",
  manifest: "",
  diagnostics: "",
  openapi: "",
  client: "",
});
