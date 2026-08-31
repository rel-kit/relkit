import { type DescriptorKind, type JsonValue, type SourceLocation } from "@relkit/contracts";
import type { Diagnostic } from "@relkit/diagnostics";
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
export const NORMALIZE_CODES = Object.freeze({
  descriptor: "RELKIT_DESCRIPTOR_INVALID",
  id: "RELKIT_ID_INVALID",
  method: "RELKIT_METHOD_INVALID",
  path: "RELKIT_PATH_INVALID",
  routeFile: "RELKIT_ROUTE_FILE_REQUIRED",
  routeExport: "RELKIT_ROUTE_EXPORT_METHOD",
  routeTransport: "RELKIT_ROUTE_LEGACY_TRANSPORT",
  reservedRoute: "RELKIT_ROUTE_RESERVED_PATH",
  rateLimit: "RELKIT_RATE_LIMIT_INVALID",
  rateLimitStore: "RELKIT_RATE_LIMIT_STORE_REQUIRED",
  rateLimitReference: "RELKIT_RATE_LIMIT_STORE_INVALID",
  profile: "RELKIT_PROFILE_INVALID",
  schedule: "RELKIT_SCHEDULE_INVALID",
  retry: "RELKIT_RETRY_INVALID",
  idempotency: "RELKIT_IDEMPOTENCY_INVALID",
  schema: "RELKIT_SCHEMA_UNAVAILABLE",
  missingTarget: "RELKIT_MISSING_TARGET",
  missingMiddleware: "RELKIT_MISSING_MIDDLEWARE",
  missingTransform: "RELKIT_MISSING_TRANSFORM",
  transformCollision: "RELKIT_TRANSFORM_ID_COLLISION",
  duplicateId: "RELKIT_DUPLICATE_ID",
  mapping: "RELKIT_MAPPING_INCOMPATIBLE",
  middlewareInput: "RELKIT_MIDDLEWARE_INPUT_INCOMPATIBLE",
  middlewareOutput: "RELKIT_MIDDLEWARE_OUTPUT_INCOMPATIBLE",
  response: "RELKIT_ROUTE_RESPONSE_INCOMPATIBLE",
  jobInput: "RELKIT_JOB_INPUT_INCOMPATIBLE",
  eventName: "RELKIT_EVENT_NAME_UNKNOWN",
  eventTarget: "RELKIT_EVENT_TARGET_INCOMPATIBLE",
  eventTriggerCollision: "RELKIT_EVENT_TRIGGER_ID_COLLISION",
  eventOnlyTarget: "RELKIT_EVENT_FUNCTION_TARGET_INVALID",
  eventFunctionOption: "RELKIT_EVENT_FUNCTION_OPTION_INVALID",
  eventFunctionResult: "RELKIT_EVENT_FUNCTION_RESULT_INVALID",
  publishes: "RELKIT_EVENT_PUBLICATION_UNKNOWN",
  publishesDuplicate: "RELKIT_EVENT_PUBLICATION_DUPLICATE",
  toolTarget: "RELKIT_TOOL_TARGET_INCOMPATIBLE",
  agentTool: "RELKIT_AGENT_TOOL_INVALID",
  model: "RELKIT_MODEL_SELECTOR_INVALID",
  modelProvider: "RELKIT_MODEL_PROVIDER_UNKNOWN",
  modelDefault: "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING",
  modelConfiguration: "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID",
  providerProfile: "RELKIT_PROVIDER_PROFILE_UNKNOWN",
  bucketProfileDuplicate: "RELKIT_BUCKET_PROFILE_DUPLICATE",
  identityAmbiguous: "RELKIT_ID_INFERENCE_AMBIGUOUS",
  source: "RELKIT_SOURCE_LOCATION_INVALID",
  collision: "RELKIT_ROUTE_COLLISION",
  handler: "RELKIT_MANIFEST_HANDLER_MISSING",
  authDuplicate: "RELKIT_AUTH_DUPLICATE",
  domain: "RELKIT_DOMAIN_INVALID",
  boundary: "RELKIT_DOMAIN_BOUNDARY",
  appDuplicate: "RELKIT_APP_DUPLICATE",
} as const);
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
  "validate event functions and publications",
  "validate exact event targets",
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
  readonly appId?: string;
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
  readonly domainId?: string;
  readonly exposure?: "public" | "internal";
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
  readonly contract: string;
  readonly clientContract: string;
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
  nodes: GraphNode[];
  edges: GraphEdge[];
  observedEdges: ObservedEdge[];
  serviceDependencies: { readonly from: string; readonly to: string }[];
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
    "constants",
    "prompt",
  ].includes(value as DescriptorKind);
}
export const EMPTY_OUTPUTS: GeneratedOutputs = Object.freeze({
  graph: "",
  manifest: "",
  diagnostics: "",
  openapi: "",
  client: "",
  contract: "",
  clientContract: "",
});
