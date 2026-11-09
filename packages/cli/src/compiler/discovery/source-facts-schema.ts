import { Schema } from "effect";

/** Factory categories recognized without evaluating source code. */
export const SourceFactoryKind = Schema.Literals([
  "app",
  "function",
  "service",
  "route",
  "middleware",
  "task",
  "job",
  "event",
  "event-trigger",
  "bucket",
  "cache",
  "tool",
  "agent",
  "channel",
  "constants",
  "prompt",
  "error",
  "transform",
]);

/** Syntax evidence for whether a factory's ID option is present. */
export const FactoryIdPresence = Schema.Literals(["explicit", "omitted", "unknown"]);

/** Source-only factory identity; positions are TypeScript character offsets. */
export const FactoryBindingFact = Schema.Struct({
  binding: Schema.optionalKey(Schema.String),
  factory: Schema.String,
  kind: SourceFactoryKind,
  idOptional: Schema.Boolean,
  id: FactoryIdPresence,
  position: Schema.Number,
  options: Schema.Array(Schema.String),
  optionPaths: Schema.optionalKey(Schema.Array(Schema.String)),
});

/** HTTP operation attached to a runtime route export. */
export const RouteOperationFact = Schema.Struct({
  exportName: Schema.String,
  method: Schema.String,
  binding: Schema.optionalKey(Schema.String),
  position: Schema.Number,
});

/** A service's declared member and optional local implementation binding. */
export const ServiceMemberFact = Schema.Struct({
  service: Schema.String,
  member: Schema.String,
  targetBinding: Schema.optionalKey(Schema.String),
  position: Schema.Number,
});

/** A constant error-factory binding and its ID evidence. */
export const ErrorBindingFact = Schema.Struct({
  binding: Schema.String,
  position: Schema.Number,
  id: FactoryIdPresence,
});

/** Named upstream export referenced by a re-export. */
export const ExportOrigin = Schema.Struct({ module: Schema.String, name: Schema.String });

/** The source location and identity evidence associated with one runtime export. */
export const ExportFact = Schema.Struct({
  position: Schema.Number,
  binding: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(FactoryBindingFact),
  routeOperation: Schema.optionalKey(RouteOperationFact),
  errorBinding: Schema.optionalKey(ErrorBindingFact),
  origin: Schema.optionalKey(ExportOrigin),
});

/** A wildcard re-export requiring resolution by the source-map stage. */
export const ExportStar = Schema.Struct({ module: Schema.String, position: Schema.Number });

/** Collected runtime exports and sorted identity evidence for one parsed file. */
export const ExportFacts = Schema.Struct({
  exports: Schema.ReadonlyMap(Schema.String, ExportFact),
  stars: Schema.Array(ExportStar),
  factoryBindings: Schema.Array(FactoryBindingFact),
  routeOperations: Schema.Array(RouteOperationFact),
  serviceMembers: Schema.Array(ServiceMemberFact),
  errorBindings: Schema.Array(ErrorBindingFact),
});

/** A local declaration's evidence before it is linked to an export. */
export const LocalBinding = Schema.Struct({
  binding: Schema.String,
  position: Schema.Number,
  factory: Schema.optionalKey(FactoryBindingFact),
  error: Schema.optionalKey(ErrorBindingFact),
});

/** The factory registry's syntax policy for one authoring function. */
export const FactoryDefinition = Schema.Struct({
  kind: SourceFactoryKind,
  idOptional: Schema.Boolean,
});
