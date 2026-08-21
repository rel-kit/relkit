import {
  Clock as EffectClock,
  Context,
  Logger as EffectLogger,
  Tracer as EffectTracer,
} from "effect";
import type { Effect } from "effect";
import type { ApplicationGraph } from "@zsys/graph";
import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  type JsonValue,
  type MaybePromise,
  type ProtocolId,
} from "@zsys/contracts";

/** Canonical graph and hash used by one runtime generation. */
export interface GraphService {
  readonly graph: ApplicationGraph;
  readonly graphHash: string;
}

export class Graph extends Context.Service<Graph, GraphService>()("zsys/runtime/Graph") {}

/** Executable references produced by the compiler for one graph hash. */
export type RuntimeHandler = (...arguments_: readonly unknown[]) => MaybePromise<unknown>;

export interface RuntimeManifest {
  readonly contractVersion: typeof MANIFEST_VERSION;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly graphHash: string;
  readonly functions: Readonly<Record<string, RuntimeHandler>>;
  readonly providers: Readonly<Record<string, unknown>>;
  readonly middleware: Readonly<Record<string, RuntimeHandler>>;
  readonly requestTransforms: Readonly<Record<string, RuntimeHandler>>;
}

export interface ManifestService {
  readonly manifest: RuntimeManifest;
}

export class Manifest extends Context.Service<Manifest, ManifestService>()(
  "zsys/runtime/Manifest",
) {}

export type ProviderCapability = "buckets" | "cache" | "jobs" | "events" | "observability";

export interface ProviderHandle {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly value: unknown;
}

export interface ProvidersService {
  readonly get: (capability: ProviderCapability, profile: string) => ProviderHandle | undefined;
}

export class Providers extends Context.Service<Providers, ProvidersService>()(
  "zsys/runtime/Providers",
) {}

export type ObservabilitySignal =
  | "request"
  | "invocation"
  | "job"
  | "event"
  | "bucket"
  | "cache"
  | "tool"
  | "agent"
  | "log"
  | "span"
  | "diagnostic"
  | "generation";

export interface ObservabilityRecord {
  readonly signal: ObservabilitySignal;
  readonly value: JsonValue;
}

/** Redaction and sink implementations consume this internal record contract. */
export interface ObservabilityContract {
  readonly record: (entry: ObservabilityRecord) => Effect.Effect<void>;
  readonly flush: Effect.Effect<void>;
}

export class Observability extends Context.Service<Observability, ObservabilityContract>()(
  "zsys/runtime/Observability",
) {}

export type RuntimeIdKind =
  "generation" | "request" | "trace" | "invocation" | "event-instance" | "span";

export interface IdSourceService {
  readonly next: (kind: RuntimeIdKind) => ProtocolId;
}

export class IdSource extends Context.Service<IdSource, IdSourceService>()(
  "zsys/runtime/IdSource",
) {}

/** Reuse Effect's testable clock and tracing/logger context references. */
export const Clock = EffectClock.Clock;
export const Logger = EffectLogger.CurrentLoggers;
export const Tracer = EffectTracer.Tracer;

export interface ShutdownService {
  readonly signal: AbortSignal;
  readonly begin: Effect.Effect<void>;
  readonly await: Effect.Effect<void>;
}

export class Shutdown extends Context.Service<Shutdown, ShutdownService>()(
  "zsys/runtime/Shutdown",
) {}
