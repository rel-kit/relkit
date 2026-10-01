import type { JsonValue, SourceLocation } from "@relkit/contracts";
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
import type { VALIDATION_PASSES } from "./normalize-types.js";

/** Ordered compiler stage names recorded by normalization. */
export type ValidationPass = (typeof VALIDATION_PASSES)[number];

/** Live or extracted descriptors, source evidence, provider metadata, and optional pass observer. */
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

/** Owning package metadata and supported runtime capability registrations. */
export interface RuntimeIntegrationPackage {
  readonly integrationId: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
  readonly registrations: readonly import("@relkit/contracts").RuntimeIntegrationRegistrationMetadata[];
}

/** Stable descriptor identity with source provenance and executable reference evidence. */
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
  readonly origin?: {
    readonly file: string;
    readonly exportName: string;
    readonly exportKind: "default" | "named";
  };
  readonly value: unknown;
}

/** Deterministic text artifacts generated from the accepted compilation. */
export interface GeneratedOutputs {
  readonly graph: string;
  readonly manifest: string;
  readonly runtimeActivation: string;
  readonly runtimeIntegrations: string;
  readonly runtimeIntegrationImports: string;
  readonly localServices: string;
  readonly diagnostics: string;
  readonly jobsManifest?: string;
  readonly openapi: string;
  readonly client: string;
  readonly contract: string;
  readonly clientContract: string;
  readonly clientRegistry: string;
  readonly clientManifest: string;
}

/** Immutable compilation evidence, graph identity, artifacts, and watch invalidation index. */
export interface NormalizationResult {
  readonly passOrder: readonly ValidationPass[];
  readonly diagnostics: readonly Diagnostic[];
  readonly descriptors: readonly NormalizedDescriptor[];
  readonly references: ReadonlyMap<string, NormalizedDescriptor>;
  readonly referencesByKind: ReadonlyMap<string, ReadonlyMap<string, NormalizedDescriptor>>;
  readonly observedEdges: readonly ObservedEdge[];
  readonly graph?: NormalizedGraph;
  readonly graphHash?: string;
  readonly outputs: GeneratedOutputs;
  readonly watch: WatchDependencyIndex;
  readonly activatable: boolean;
}

/** Mutable execution-local state shared by ordered compiler validation stages. */
export interface NormalizationWork {
  readonly input: NormalizeInput;
  descriptors: NormalizedDescriptor[];
  references: Map<string, NormalizedDescriptor>;
  referencesByKind: Map<string, Map<string, NormalizedDescriptor>>;
  middlewareReferences: Map<string, NormalizedDescriptor>;
  transformReferences: Map<string, NormalizedDescriptor>;
  schemas: Map<string, JsonValue>;
  schemaHashes: Map<string, string>;
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
