import {
  Clock as EffectClock,
  Context,
  Logger as EffectLogger,
  Tracer as EffectTracer,
} from "effect";
import type { Effect } from "effect";
import type { ApplicationGraph, ProviderBindingNode } from "@relkit/graph";
import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  type JsonValue,
  type MaybePromise,
  type ProtocolId,
  type RuntimeActivationFingerprint,
  type RuntimeIntegrationPlanReference,
} from "@relkit/contracts";

/** Canonical graph and hash used by one runtime generation. */
export interface GraphService {
  readonly graph: ApplicationGraph;
  readonly graphHash: string;
}

export class Graph extends Context.Service<Graph, GraphService>()("relkit/runtime/Graph") {}

/** Executable references produced by the compiler for one graph hash. */
export type RuntimeHandler = (...arguments_: readonly unknown[]) => MaybePromise<unknown>;

export interface RuntimeManifest {
  readonly contractVersion: typeof MANIFEST_VERSION;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly graphHash: string;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly runtimeIntegrationsPlan: RuntimeIntegrationPlanReference;
  readonly functions: Readonly<Record<string, RuntimeHandler>>;
  readonly middleware: Readonly<Record<string, RuntimeHandler>>;
  readonly requestTransforms: Readonly<Record<string, RuntimeHandler>>;
}

export interface ManifestService {
  readonly manifest: RuntimeManifest;
}

export class Manifest extends Context.Service<Manifest, ManifestService>()(
  "relkit/runtime/Manifest",
) {}

export type ProviderCapability = ProviderBindingNode["capability"];

export interface ProviderHandle {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly value: unknown;
}

export interface ProvidersService {
  readonly get: (capability: ProviderCapability, profile: string) => ProviderHandle | undefined;
}

export class Providers extends Context.Service<Providers, ProvidersService>()(
  "relkit/runtime/Providers",
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
  "relkit/runtime/Observability",
) {}

export type RuntimeIdKind =
  "generation" | "request" | "trace" | "invocation" | "event-instance" | "span";

export interface IdSourceService {
  readonly next: (kind: RuntimeIdKind) => ProtocolId;
}

export class IdSource extends Context.Service<IdSource, IdSourceService>()(
  "relkit/runtime/IdSource",
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
  "relkit/runtime/Shutdown",
) {}
