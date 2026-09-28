import type {
  PublicClock as SharedPublicClock,
  PublicLogger as SharedPublicLogger,
  PublicTrace as SharedPublicTrace,
  InvocationMetadata as SharedInvocationMetadata,
  InvocationSource as SharedInvocationSource,
} from "@relkit/invocation";
import type {
  AgentClients,
  BucketClients,
  CacheClients,
  EventClients,
  JobClients,
  TaskClients,
} from "./clients.types.js";
import type { AgentRefAny, BucketRefAny, CacheRefAny, JobRefAny, TaskRefAny } from "./types.js";

/** Allowed resources a function may declare.
 * @example const dependencies: FunctionDependencies = { buckets: { uploads } };
 */
export interface FunctionDependencies {
  readonly tasks?: Readonly<Record<string, TaskRefAny>>;
  readonly jobs?: Readonly<Record<string, JobRefAny>>;
  readonly buckets?: Readonly<Record<string, BucketRefAny>>;
  readonly cache?: Readonly<Record<string, CacheRefAny>>;
  readonly agents?: Readonly<Record<string, AgentRefAny>>;
}

/** Source category of a function invocation.
 * @example const source: InvocationSource = "tool";
 */
export type InvocationSource = SharedInvocationSource;
/** Trace and identity metadata for one invocation.
 * @example const metadata: InvocationMetadata = context.invocation;
 */
export type InvocationMetadata = SharedInvocationMetadata;
/** Application environment supplied to handlers.
 * @example const env: ResolvedApplicationEnv = context.env;
 */
export type ResolvedApplicationEnv = keyof Relkit.ApplicationEnv extends never
  ? Readonly<Record<string, unknown>>
  : Readonly<Relkit.ApplicationEnv>;

/** Logger exposed to application handlers.
 * @example const logger: PublicLogger = context.log;
 */
export type PublicLogger = SharedPublicLogger;
/** Clock exposed to application handlers.
 * @example const clock: PublicClock = context.time;
 */
export type PublicClock = SharedPublicClock;
/** Trace controls exposed to handlers.
 * @example const trace: PublicTrace = context.trace;
 */
export type PublicTrace = SharedPublicTrace;

declare global {
  namespace Relkit {
    interface ApplicationEnv {}
    interface ApplicationContextRegistry {}
    interface EventRegistry {}
  }
}

/** Application-owned additions to the handler context.
 * @example type Registry = ApplicationContextRegistry;
 */
export type ApplicationContextRegistry = Relkit.ApplicationContextRegistry;

type RegisteredContext<
  Key extends PropertyKey,
  Fallback,
> = Key extends keyof Relkit.ApplicationContextRegistry
  ? Relkit.ApplicationContextRegistry[Key]
  : Fallback;

/** Session lookup available to a handler.
 * @example const session = await context.auth.getSession();
 */
export interface AuthContext<Session = unknown> {
  /** Looks up the current session.
   * @returns The session or null when unauthenticated.
   * @example const session = await context.auth.getSession();
   */
  readonly getSession: () => Promise<Session | null>;
}

/** Rejects unsupported function dependency declarations.
 * @example type Allowed = FunctionDependencyOptions<FunctionDependencies>;
 */
export type FunctionDependencyOptions<D extends FunctionDependencies> = "functions" extends keyof D
  ? never
  : D;

/** Registered event names accepted by publishes.
 * @example type EventName = KnownEventName;
 */
export type KnownEventName = Extract<keyof Relkit.EventRegistry, string>;
type PublishedEventMap<Names extends readonly KnownEventName[]> = {
  readonly [Name in Names[number]]: Relkit.EventRegistry[Name];
};

/** Invocation context before optional progress is added.
 * @example const env = context.env;
 */
export interface FunctionContextBase<
  D extends FunctionDependencies = {},
  Publishes extends readonly KnownEventName[] = readonly [],
> {
  readonly invocation: InvocationMetadata;
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly trace: PublicTrace;
  readonly tasks: TaskClients<D["tasks"]>;
  readonly jobs: JobClients<D["jobs"]>;
  readonly events: EventClients<PublishedEventMap<Publishes>>;
  readonly buckets: BucketClients<D["buckets"]>;
  readonly cache: CacheClients<D["cache"]>;
  readonly agents: AgentClients<D["agents"]>;
  readonly database: RegisteredContext<"database", Readonly<Record<string, never>>>;
  readonly auth: RegisteredContext<"auth", AuthContext>;
  readonly constants: RegisteredContext<"constants", Readonly<Record<string, never>>>;
  readonly prompts: RegisteredContext<"prompts", Readonly<Record<string, never>>>;
}

/** Handler context with declared resources and optional progress.
 * @example const run = async (_input: unknown, context: FunctionContext) => context.time.now();
 */
export type FunctionContext<
  D extends FunctionDependencies = {},
  Publishes extends readonly KnownEventName[] = readonly [],
  Progress = never,
> = FunctionContextBase<D, Publishes> &
  ([Progress] extends [never]
    ? {}
    : { readonly progress: import("@relkit/invocation").ProgressEmitter<Progress> });
