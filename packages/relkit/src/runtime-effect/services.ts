import type {
  GraphService,
  RuntimeHandler,
  RuntimeManifest,
  ManifestService,
  ProviderCapability,
  ProviderHandle,
  ProvidersService,
  ObservabilitySignal,
  ObservabilityRecord,
  ObservabilityContract,
  RuntimeIdKind,
  IdSourceService,
  ShutdownService,
} from "./services.types.js";
export type {
  GraphService,
  RuntimeHandler,
  RuntimeManifest,
  ManifestService,
  ProviderCapability,
  ProviderHandle,
  ProvidersService,
  ObservabilitySignal,
  ObservabilityRecord,
  ObservabilityContract,
  RuntimeIdKind,
  IdSourceService,
  ShutdownService,
} from "./services.types.js";
import {
  Clock as EffectClock,
  Context,
  Logger as EffectLogger,
  Tracer as EffectTracer,
} from "effect";

/** Immutable graph dependency shared by all operations in one generation. */
export class Graph extends Context.Service<Graph, GraphService>()("relkit/runtime/Graph") {}

/** Generation-owned executable manifest matching the graph fingerprint. */
export class Manifest extends Context.Service<Manifest, ManifestService>()(
  "relkit/runtime/Manifest",
) {}

/** Synchronous compatibility lookup over the scoped provider registry. */
export class Providers extends Context.Service<Providers, ProvidersService>()(
  "relkit/runtime/Providers",
) {}

/** Generation-owned redaction and export boundary for internal records. */
export class Observability extends Context.Service<Observability, ObservabilityContract>()(
  "relkit/runtime/Observability",
) {}

/** Synchronous identifier source, replaceable with deterministic test identifiers. */
export class IdSource extends Context.Service<IdSource, IdSourceService>()(
  "relkit/runtime/IdSource",
) {}

/** Reuse Effect's testable clock and tracing/logger context references. */
export const Clock = EffectClock.Clock;

export const Logger = EffectLogger.CurrentLoggers;

export const Tracer = EffectTracer.Tracer;

/** Generation shutdown signal and coordinated completion barrier. */
export class Shutdown extends Context.Service<Shutdown, ShutdownService>()(
  "relkit/runtime/Shutdown",
) {}
