import { createClient } from "@relkit/client";
import { Cause, Context, Effect, Layer, MutableRef, Ref, Schema } from "effect";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect, cleanupLayer } from "./cleanup.service.js";
import { JobsIterableSchema, JobsIteratorSchema } from "../commands/jobs.schemas.js";
import type { JobsSdkOperations } from "./jobs-sdk.types.js";
import { boundedJobsFetch } from "./jobs-sdk-fetch.js";

/** Native client proxy authority, adapted only at individual SDK call boundaries. */
export class CliJobsSdk extends Context.Service<CliJobsSdk, JobsSdkOperations>()(
  "relkit/cli/JobsSdk",
) {}

/**
 * Captures cleanup publication without constructing a client or starting a request.
 * @returns A Layer with explicit cleanup authority; HTTP client handles are resource-free.
 */
export const jobsSdkLayer = Layer.effect(
  CliJobsSdk,
  Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    return CliJobsSdk.of({
      trigger: (baseUrl, headers, job, input, signal) =>
        observeCli(
          "jobs.sdk-trigger",
          Effect.scoped(
            ownSdkCall((ownedSignal, reportCleanup) =>
              invokeProcedure(
                baseUrl,
                headers,
                job,
                "trigger",
                input,
                AbortSignal.any([signal, ownedSignal]),
                reportCleanup,
              ),
            ).pipe(Effect.provideService(CliCleanup, cleanup)),
          ),
        ),
      watch: (baseUrl, headers, job, input, signal) =>
        observeCli(
          "jobs.sdk-watch",
          ownSdkCall(
            async (ownedSignal, reportCleanup) =>
              toJobsIterator(
                await invokeProcedure(
                  baseUrl,
                  headers,
                  job,
                  "watch",
                  input,
                  AbortSignal.any([signal, ownedSignal]),
                  reportCleanup,
                ),
              ),
            (iterator) => iterator.return?.(),
          ).pipe(Effect.provideService(CliCleanup, cleanup)),
        ),
    });
  }),
);

/** Live resource-free SDK factory with invocation-owned cleanup evidence. */
export const jobsSdkLiveLayer = jobsSdkLayer.pipe(Layer.provideMerge(cleanupLayer));

/**
 * Owns physical SDK settlement and optional iterator release across interruption.
 * @typeParam A - Original native SDK result.
 * @param call - One native call consuming its cancellation signal.
 * @param release - Optional exactly-once result release, used for watch iterators.
 * @returns A scoped native result; interrupted mutation receipts settle before closure.
 */
function ownSdkCall<A>(
  call: (signal: AbortSignal, reportCleanup: (cause: unknown) => void) => Promise<A>,
  release?: (value: A) => unknown | PromiseLike<unknown>,
) {
  return Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    const issues = yield* Ref.make<readonly unknown[]>([]);
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const controller = new AbortController();
        const promise = Promise.resolve().then(() =>
          call(controller.signal, (cause) => {
            MutableRef.update(issues.ref, (current) => [...current.slice(-127), cause]);
          }),
        );
        void promise.catch(() => undefined);
        return { controller, promise };
      }),
      (owner) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => owner.controller.abort(new Error("Jobs SDK scope closed.")));
          yield* cleanupEffect(
            "jobs.sdk-release",
            cliPromise("jobs.sdk-release", () =>
              owner.promise.then(
                (value) => release?.(value),
                () => undefined,
              ),
            ),
          );
          yield* Effect.forEach(
            yield* Ref.get(issues),
            (cause) => cleanup.record("jobs.sdk.body-release", Cause.die(cause)),
            { discard: true },
          );
        }),
    );
    return yield* cliPromise("jobs.sdk-call", () => owner.promise);
  });
}

/**
 * Invokes one dynamic native proxy procedure without asserting an application contract.
 * @param baseUrl - Validated loopback backend URL.
 * @param headers - Issued identity and protocol metadata.
 * @param job - Resolved public job name.
 * @param action - Declared native procedure.
 * @param input - Existing wire payload.
 * @param signal - Owned SDK cancellation.
 * @param reportCleanup - Receipt retaining secondary body cancellation failures.
 * @returns The original native procedure Promise.
 */
async function invokeProcedure(
  baseUrl: string,
  headers: Readonly<Record<string, string>>,
  job: string,
  action: "trigger" | "watch",
  input: unknown,
  signal: AbortSignal,
  reportCleanup: (cause: unknown) => void,
): Promise<unknown> {
  const client: unknown = createClient({
    baseUrl,
    headers,
    fetch: boundedJobsFetch(globalThis.fetch, reportCleanup),
  });
  const entry = proxyField(proxyField(client, "jobs"), job);
  const parent = action === "watch" ? proxyField(entry, "runs") : entry;
  const procedure = proxyField(parent, action);
  if (typeof procedure !== "function") throw new TypeError("Jobs RPC procedure is unavailable.");
  const value: unknown = Reflect.apply(procedure, parent, [input, { signal }]);
  return value;
}

/**
 * Reads an intended dynamic proxy field while retaining its native receiver.
 * @param value - Native client proxy or nested namespace.
 * @param name - Declared path component or resolved job name.
 * @returns The opaque field value.
 */
function proxyField(value: unknown, name: string): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function"))
    throw new TypeError("Jobs RPC namespace is unavailable.");
  return Reflect.get(value, name);
}

/**
 * Validates an opaque SDK iterable before requesting its iterator exactly once.
 * @param value - Original watch result.
 * @returns The original receiver-preserving iterator.
 * @throws The established invalid-watch diagnostic.
 */
export function toJobsIterator(value: unknown): AsyncIterator<unknown> {
  const iterator: unknown = Schema.is(JobsIterableSchema)(value)
    ? value[Symbol.asyncIterator]()
    : value;
  if (Schema.is(JobsIteratorSchema)(iterator)) return iterator;
  throw new TypeError("Job watch procedure did not return an async iterator.");
}
