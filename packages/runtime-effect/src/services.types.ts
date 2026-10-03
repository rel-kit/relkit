import type { Effect } from "effect";
import type { ApplicationGraph, ProviderBindingNode } from "@relkit/graph";
import type {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  JsonValue,
  MaybePromise,
  ProtocolId,
  RuntimeActivationFingerprint,
  RuntimeIntegrationPlanReference,
} from "@relkit/contracts";

/** Canonical graph and hash used by one runtime generation. */
export interface GraphService {
  readonly graph: ApplicationGraph;
  readonly graphHash: string;
}

/** Executable references produced by the compiler for one graph hash.
 * @param arguments_ - Arguments supplied by the owning invocation/middleware adapter.
 * @returns The authored handler's synchronous result or Promise.
 */
export type RuntimeHandler = (...arguments_: readonly unknown[]) => MaybePromise<unknown>;

/** Compiler-produced executable cohort; function values are trusted build output. */
export interface RuntimeManifest {
  readonly contractVersion: typeof MANIFEST_VERSION;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly graphHash: string;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly runtimeIntegrationsPlan: RuntimeIntegrationPlanReference;
  readonly functions: Readonly<Record<string, RuntimeHandler>>;
  readonly tasks?: Readonly<Record<string, unknown>>;
  readonly jobs?: Readonly<Record<string, unknown>>;
  readonly middleware: Readonly<Record<string, RuntimeHandler>>;
  readonly requestTransforms: Readonly<Record<string, RuntimeHandler>>;
}

/** Manifest dependency shared by operations in one generation. */
export interface ManifestService {
  readonly manifest: RuntimeManifest;
}

/** Provider capabilities defined by the existing graph contract. */
export type ProviderCapability = ProviderBindingNode["capability"];

/** Compatibility handle resolving a capability/profile pair. */
export interface ProviderHandle {
  readonly capability: ProviderCapability;
  readonly profile: string;
  readonly value: unknown;
}

/** Synchronous lookup over the scoped registry; it performs no acquisition. */
export interface ProvidersService {
  /** Looks up an already acquired capability without extending its lifetime.
   * @param capability - Required provider capability.
   * @param profile - Profile selected by the compiled binding.
   * @returns The generation-owned handle, or undefined when no binding exists.
   */
  readonly get: (capability: ProviderCapability, profile: string) => ProviderHandle | undefined;
}

/** Bounded signal vocabulary accepted by the observability adapter. */
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

/** Internal JSON record passed through the configured redaction boundary. */
export interface ObservabilityRecord {
  readonly signal: ObservabilitySignal;
  readonly value: JsonValue;
}

/** Redaction and sink implementations consume this internal record contract. */
export interface ObservabilityContract {
  /** Collects an internal record through the owning redaction/export boundary.
   * @param entry - Versioned signal and JSON-safe internal value.
   * @returns Lazy collection whose sink failures remain observational.
   */
  readonly record: (entry: ObservabilityRecord) => Effect.Effect<void>;

  /** Completes pending exports in the owning runtime before disposal. */
  readonly flush: Effect.Effect<void>;
}

/** Bounded identifier categories supported by the generation source. */
export type RuntimeIdKind =
  "generation" | "request" | "trace" | "invocation" | "event-instance" | "span";

/** Synchronous protocol identifier source shared across a generation. */
export interface IdSourceService {
  /** Produces the next identifier using the generation's configured source.
   * @param kind - Bounded protocol identifier category.
   * @returns The new protocol identifier.
   */
  readonly next: (kind: RuntimeIdKind) => ProtocolId;
}

/** Generation-owned cancellation and completion barrier. */
export interface ShutdownService {
  readonly signal: AbortSignal;
  readonly begin: Effect.Effect<void>;
  readonly await: Effect.Effect<void>;
}
