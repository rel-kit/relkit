"use client";

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
import { ORPCError } from "../index.js";
import { useRelkitClient } from "./context.js";
import { relkitKey } from "./keys.js";
import { procedureUtils } from "./procedure.js";
import type { ErrorFor, InputFor, MutationSelector, OutputFor, QuerySelector } from "./registry.js";
import { forgetPending, pendingScopeKey, rememberPending, updatePending } from "./pending.js";

type QueryInput<Name extends QuerySelector, Selected> = Omit<
  UseQueryOptions<OutputFor<Name>, ErrorFor<Name>, Selected>,
  "queryKey" | "queryFn"
> & { readonly input: InputFor<Name> };

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
        runtime.identityKey === null
      ) {
        throw new RelkitWriteError("not-sent", `Relkit client is not ready (${runtime.status})`);
      }
      if (
        (globalThis as { navigator?: { readonly onLine?: boolean } }).navigator?.onLine === false
      ) {
        throw new RelkitWriteError("not-sent", "The browser is offline.");
      }
      const scopeKey = pendingScopeKey(runtime.scope);
      const pending = await rememberPending(scopeKey, "mutation", name, input);
      try {
        const value = await original(input, mutationContext);
        forgetPending(scopeKey, pending.operationId);
        return value;
      } catch (error) {
        if (error instanceof ORPCError) forgetPending(scopeKey, pending.operationId);
        else updatePending(scopeKey, { ...pending, state: "unknown" });
        throw error;
      }
    },
    mutationKey: runtime.scope
      ? relkitKey(runtime.scope, "mutation", name)
      : ["relkit", "blocked", name],
  } as UseMutationOptions<OutputFor<Name>, ErrorFor<Name>, InputFor<Name>, Context>);
}

export class RelkitWriteError extends Error {
  constructor(
    readonly outcome: "not-sent" | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "RelkitWriteError";
  }
}

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

export function useRouteUtils<Name extends QuerySelector | MutationSelector>(name: Name) {
  const runtime = useRelkitClient();
  return procedureUtils(runtime.utils, name);
}
