import { type JsonValue, type SourceLocation } from "@relkit/contracts";
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
export { NORMALIZE_CODES } from "./normalize-codes.js";
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
  readonly runtimeIntegrationPackages?: readonly RuntimeIntegrationPackage[];
  readonly sourceMap?: readonly SourceMapEntry[];
  readonly locations?:
    ReadonlyMap<string, SourceLocation> | Readonly<Record<string, SourceLocation>>;
  readonly onPass?: (pass: ValidationPass, index: number) => void;
}
export interface RuntimeIntegrationPackage {
  readonly integrationId: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
  readonly registrations: readonly import("@relkit/contracts").RuntimeIntegrationRegistrationMetadata[];
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
  readonly runtimeActivation: string;
  readonly runtimeIntegrations: string;
  readonly runtimeIntegrationImports: string;
  readonly localServices: string;
  readonly diagnostics: string;
  readonly openapi: string;
  readonly client: string;
  readonly contract: string;
  readonly clientContract: string;
  readonly clientRegistry: string;
  readonly clientManifest: string;
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
export const EMPTY_OUTPUTS: GeneratedOutputs = Object.freeze({
  graph: "",
  manifest: "",
  runtimeActivation: "",
  runtimeIntegrations: "",
  runtimeIntegrationImports: "",
  localServices: "",
  diagnostics: "",
  openapi: "",
  client: "",
  contract: "",
  clientContract: "",
  clientRegistry: "",
  clientManifest: "",
});
