"use client";

import type { QueryInput } from "./finite-hooks.types.js";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseQuery,
  type InfiniteData,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { mutationOperations, mutationRuntime } from "./mutation-runtime.js";
import { useRelkitClient } from "./context.js";
import { relkitJobKey, relkitKey } from "./keys.js";
import { procedureUtils } from "./procedure.js";
import type {
  ErrorFor,
  InputFor,
  MutationSelector,
  OutputFor,
  QuerySelector,
} from "./registry.types.js";
import { pendingScopeKey } from "./pending.js";
import { generatedJobTriggerName, prepareJobRequest } from "./job-hooks-support.js";
import { RelkitWriteError } from "./write-error.js";
export { RelkitWriteError } from "./write-error.js";

/**
 * Adapts a declared finite route into a scope-bound TanStack query.
 * @typeParam Name - Declared resource or procedure selector.
 * @typeParam Selected - Caller-selected query result.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The typed finite query result.
 */
export function useRoute<Name extends QuerySelector, Selected = OutputFor<Name>>(
  name: Name,
  options: QueryInput<Name, Selected>,
): UseQueryResult<Selected, ErrorFor<Name>> {
  const runtime = useRelkitClient();
  const generated = procedureUtils(runtime.utils, name).queryOptions({ input: options.input });
  const enabled =
    runtime.status === "ready" && runtime.identityKey !== null && options.enabled !== false;
  return useQuery({
    ...generated,
    ...options,
    enabled,
    queryKey: runtime.scope
      ? relkitKey(runtime.scope, "query", name, options.input)
      : ["relkit", "blocked", name],
  } as UseQueryOptions<OutputFor<Name>, ErrorFor<Name>, Selected>);
}

/**
 * Adapts a ready declared route into a scope-bound suspense query.
 * @typeParam Name - Declared resource or procedure selector.
 * @typeParam Selected - Caller-selected query result.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The typed ready suspense query result.
 */
export function useSuspenseRoute<Name extends QuerySelector, Selected = OutputFor<Name>>(
  name: Name,
  options: Omit<
    UseSuspenseQueryOptions<OutputFor<Name>, ErrorFor<Name>, Selected>,
    "queryKey" | "queryFn"
  > & { readonly input: InputFor<Name> },
): UseSuspenseQueryResult<Selected, ErrorFor<Name>> {
  const runtime = useRelkitClient();
  if (runtime.status !== "ready" || runtime.scope === undefined || runtime.identityKey === null) {
    throw new Error(`Relkit client is not ready (${runtime.status})`);
  }
  const generated = procedureUtils(runtime.utils, name).queryOptions({ input: options.input });
  return useSuspenseQuery({
    ...generated,
    ...options,
    queryKey: relkitKey(runtime.scope, "query", name, options.input),
  } as UseSuspenseQueryOptions<OutputFor<Name>, ErrorFor<Name>, Selected>);
}

/**
 * Adapts a declared accepted-work operation into TanStack mutation state.
 * @typeParam Name - Declared resource or procedure selector.
 * @typeParam Context - TanStack mutation context.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The typed accepted-work mutation result.
 */
export function useRouteMutation<Name extends MutationSelector, Context = unknown>(
  name: Name,
  options: Omit<
    UseMutationOptions<OutputFor<Name>, ErrorFor<Name>, InputFor<Name>, Context>,
    "mutationKey" | "mutationFn"
  > = {},
): UseMutationResult<OutputFor<Name>, ErrorFor<Name>, InputFor<Name>, Context> {
  const runtime = useRelkitClient();
  const generated = procedureUtils(runtime.utils, name).mutationOptions() as Record<
    string,
    unknown
  >;
  const original = generated.mutationFn as NonNullable<
    UseMutationOptions<OutputFor<Name>, ErrorFor<Name>, InputFor<Name>, Context>["mutationFn"]
  >;
  return useMutation({
    ...generated,
    ...options,
    retry: options.retry ?? false,
    networkMode: options.networkMode ?? "always",
    mutationFn: async (input, mutationContext) => {
      if (
        runtime.status !== "ready" ||
        runtime.scope === undefined ||
        runtime.identityKey === null ||
        runtime.identity === undefined
      ) {
        throw new RelkitWriteError("not-sent", `Relkit client is not ready (${runtime.status})`);
      }
      if (
        (globalThis as { navigator?: { readonly onLine?: boolean } }).navigator?.onLine === false
      ) {
        throw new RelkitWriteError("not-sent", "The browser is offline.");
      }
      const scopeKey = pendingScopeKey(runtime.scope);
      const jobName = generatedJobTriggerName(name);
      const prepared =
        jobName === undefined
          ? undefined
          : prepareJobRequest(input, runtime.identity, mutationContext);
      const effectiveInput = (prepared?.value ?? input) as InputFor<Name>;
      return (await runExecutionPromise(
        mutationRuntime,
        mutationOperations.submit(
          scopeKey,
          prepared === undefined ? "mutation" : "job-trigger",
          name,
          effectiveInput,
          {},
          prepared === undefined
            ? {}
            : {
                operationId: prepared.operationId,
                retainRequest: true,
                ...(prepared.idempotencyKey === undefined
                  ? {}
                  : { idempotencyKey: prepared.idempotencyKey }),
              },
          () => original(effectiveInput, mutationContext),
        ),
      )) as OutputFor<Name>;
    },
    mutationKey: runtime.scope
      ? generatedJobTriggerName(name) === undefined
        ? relkitKey(runtime.scope, "mutation", name)
        : relkitJobKey(runtime.scope, "trigger", { jobId: generatedJobTriggerName(name)! })
      : ["relkit", "blocked", name],
  } as UseMutationOptions<OutputFor<Name>, ErrorFor<Name>, InputFor<Name>, Context>);
}

/**
 * Adapts a declared paginated route while retaining page and scope inference.
 * @typeParam Name - Declared resource or procedure selector.
 * @typeParam PageParam - Declared pagination cursor.
 * @typeParam Selected - Caller-selected query result.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The typed paginated query result.
 */
export function useInfiniteRoute<
  Name extends QuerySelector,
  PageParam,
  Selected = InfiniteData<OutputFor<Name>, PageParam>,
>(
  name: Name,
  options: Omit<
    UseInfiniteQueryOptions<
      OutputFor<Name>,
      ErrorFor<Name>,
      Selected,
      readonly unknown[],
      PageParam
    >,
    "queryKey" | "queryFn"
  > & { readonly input: (page: PageParam) => InputFor<Name> },
): UseInfiniteQueryResult<Selected, ErrorFor<Name>> {
  const runtime = useRelkitClient();
  const generated = procedureUtils(runtime.utils, name).infiniteOptions({
    input: options.input,
    initialPageParam: options.initialPageParam,
  });
  return useInfiniteQuery({
    ...generated,
    ...options,
    enabled:
      runtime.status === "ready" && runtime.identityKey !== null && options.enabled !== false,
    queryKey: runtime.scope ? relkitKey(runtime.scope, "query", name) : ["relkit", "blocked", name],
  } as UseInfiniteQueryOptions<
    OutputFor<Name>,
    ErrorFor<Name>,
    Selected,
    readonly unknown[],
    PageParam
  >);
}
/**
 * Returns the existing generated query/mutation utilities for a declared selector.
 * @typeParam Name - Declared resource or procedure selector.
 * @param name - Declared resource or selector identity.
 * @returns The declared generated query and mutation utilities.
 */
export function useRouteUtils<Name extends QuerySelector | MutationSelector>(name: Name) {
  const runtime = useRelkitClient();
  return procedureUtils(runtime.utils, name);
}
