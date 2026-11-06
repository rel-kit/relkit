import type { Effect, Exit } from "effect";

/** Resolved immutable fields and generation startup cancellation. */
export interface GenerationEnvironmentService {
  readonly values: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal | undefined;
}

/** Acquisition context; dependency reads are permitted only after acquisition. */
export interface GenerationServiceContext {
  readonly environment: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal | undefined;
  /** Reads an earlier resource; acquisition ordering establishes its availability.
   * @typeParam A - Caller-asserted resource type for the declared dependency.
   * @param id - Previously acquired resource identifier.
   * @returns The acquired resource value.
   * @throws Error when acquisition has not registered that identifier.
   */
  readonly get: <A = unknown>(id: string) => A;
}

/** Scoped acquisition/release contract with explicit ordering dependencies.
 * @typeParam A - Resource value owned until generation disposal.
 */
export interface GenerationServiceDefinition<A = unknown> {
  readonly id: string;
  readonly dependencies?: readonly string[];
  /** Acquires one resource lazily after its declared dependencies.
   * @param context - Explicit environment, cancellation and earlier resources.
   * @returns The resource or an expected acquisition failure in the owning Scope.
   */
  readonly acquire: (context: GenerationServiceContext) => Effect.Effect<A, unknown>;

  /** Releases the acquired resource during reverse-order generation finalization.
   * @param value - Successfully acquired resource.
   * @param exit - The generation scope's completion, failure or interruption.
   * @returns Finalization without a typed failure; defects remain visible to the owner.
   */
  readonly release?: (value: A, exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void, never>;
}

/** Frozen compatibility registry; callers assert the type of known resource IDs. */
export interface GenerationServiceRegistry {
  readonly order: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
  /** Reads a frozen resource snapshot without performing acquisition.
   * @typeParam A - Caller-asserted type of the known identifier.
   * @param id - Resource identifier.
   * @returns The resource, or undefined when the identifier is absent.
   */
  readonly get: <A = unknown>(id: string) => A | undefined;
}
