import { abortablePromise } from "./abort.js";
import { makeContext } from "./context.js";
import type { InvocationRecord, PublicClock, PublicLogger } from "./contracts.js";
import { MANAGED_DEPENDENCY_CATEGORIES } from "./dispatcher-types.js";
import type {
  InvocationContextFactory,
  LocalStructuredLogger,
  ManagedDependencySources,
  StructuredLogRecord,
} from "./dispatcher-types.js";
import type { ManagedDependencyCategory } from "./dispatcher-types.js";

export class DependencyNotConfiguredError extends Error {
  readonly code = "RELKIT_DEPENDENCY_NOT_CONFIGURED" as const;
  readonly category: ManagedDependencyCategory;
  readonly dependencyName: string;

  constructor(category: ManagedDependencyCategory, dependencyName: string) {
    super(`Managed dependency "${category}.${dependencyName}" has no configured standalone client`);
    this.name = "DependencyNotConfiguredError";
    this.category = category;
    this.dependencyName = dependencyName;
  }
}

export function createLocalClock(signal: AbortSignal, now: () => number = Date.now): PublicClock {
  return Object.freeze({
    now: () => new Date(now()),
    sleep: (milliseconds: number): Promise<void> => {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        return Promise.reject(new RangeError("sleep duration must be finite and non-negative"));
      }
      return abortablePromise(
        signal,
        (sleepSignal) =>
          new Promise<void>((resolve, reject) => {
            const onAbort = (): void => {
              clearTimeout(timer);
              reject(sleepSignal.reason ?? new Error("Operation aborted"));
            };
            const timer = setTimeout(() => {
              sleepSignal.removeEventListener("abort", onAbort);
              resolve();
            }, milliseconds);
            sleepSignal.addEventListener("abort", onAbort, { once: true });
            if (sleepSignal.aborted) onAbort();
          }),
      );
    },
  });
}

export function createLocalStructuredLogger(
  record: InvocationRecord,
  time: PublicClock,
): LocalStructuredLogger {
  const entries: StructuredLogRecord[] = [];
  const write = (
    level: StructuredLogRecord["level"],
    message: string,
    fields: Readonly<Record<string, unknown>> | undefined,
  ): void => {
    entries.push(
      Object.freeze({
        level,
        message,
        fields: Object.freeze({ ...(fields ?? {}) }),
        timestamp: time.now().toISOString(),
        invocationId: record.id,
        traceId: record.traceId,
        functionId: record.functionId,
        source: record.source,
        ...(record.serviceId === undefined ? {} : { serviceId: record.serviceId }),
      }),
    );
  };
  return Object.freeze({
    trace: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("trace", message, fields),
    debug: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("debug", message, fields),
    info: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("info", message, fields),
    warn: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("warn", message, fields),
    error: (message: string, fields?: Readonly<Record<string, unknown>>) =>
      write("error", message, fields),
    get records(): readonly StructuredLogRecord[] {
      return Object.freeze([...entries]);
    },
  });
}

export interface StandaloneContextOptions<Context extends { readonly signal: AbortSignal }> {
  readonly factory?: InvocationContextFactory<Context>;
  readonly record: InvocationRecord;
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, unknown>>;
  readonly time: PublicClock;
  readonly logger?: PublicLogger;
  readonly clients?: ManagedDependencySources;
}

export async function makeStandaloneContext<Context extends { readonly signal: AbortSignal }>(
  options: StandaloneContextOptions<Context>,
): Promise<Context> {
  const base = await makeContext(
    options.factory,
    options.record,
    options.signal,
    options.env,
    options.time,
  );
  const installManagedMaps = options.factory === undefined || options.clients !== undefined;
  return Object.freeze({
    ...base,
    ...(options.logger === undefined && options.factory !== undefined
      ? {}
      : { log: options.logger ?? createLocalStructuredLogger(options.record, options.time) }),
    ...(installManagedMaps ? createManagedMaps(options.clients) : {}),
  }) as Context;
}

function createManagedMaps(
  sources: ManagedDependencySources | undefined,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const categories: readonly ManagedDependencyCategory[] = MANAGED_DEPENDENCY_CATEGORIES;
  return Object.fromEntries(
    categories.map((category) => [category, configuredMap(category, sources?.[category])]),
  );
}

function configuredMap(
  category: ManagedDependencyCategory,
  source: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  const target = Object.freeze({ ...(source ?? {}) });
  return new Proxy(target, {
    get(current, property, receiver) {
      if (typeof property === "string" && !Object.hasOwn(current, property)) {
        throw new DependencyNotConfiguredError(category, property);
      }
      return Reflect.get(current, property, receiver);
    },
  });
}
