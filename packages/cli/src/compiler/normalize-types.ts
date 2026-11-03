import type { GeneratedOutputs } from "./normalize-types.types.js";
export type {
  ValidationPass,
  NormalizeInput,
  RuntimeIntegrationPackage,
  NormalizedDescriptor,
  GeneratedOutputs,
  NormalizationResult,
  NormalizationWork,
} from "./normalize-types.types.js";

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
