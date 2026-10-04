"use client";

import type { JobMutationOptions } from "./job-mutation-hooks.types.js";
export type { JobMutationOptions } from "./job-mutation-hooks.types.js";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type {
  JobCancelInputFor,
  JobCancelName,
  JobCancelOutputFor,
  JobFailureFor,
  JobRetryInputFor,
  JobRetryName,
  JobRetryOutputFor,
  JobTriggerInputFor,
  JobTriggerOutputFor,
  JobTriggerName,
} from "../jobs/job-registry-derived.types.js";
import { useRelkitClient } from "./context.js";
import { relkitJobKey } from "./keys.js";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { mutationOperations, mutationRuntime } from "./mutation-runtime.js";
import { pendingScopeKey } from "./pending.js";
import { procedureUtils } from "./procedure.js";
import { RelkitWriteError } from "./write-error.js";
import { prepareJobRequest, readOperationId } from "./job-hooks-support.js";
import { controlReferences, offline, writableScope } from "./job-mutation-support.js";

/**
 * Adapts a declared job trigger and its pending authority into TanStack mutation state.
 * @typeParam Name - Declared resource or procedure selector.
 * @typeParam Context - TanStack mutation context.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The typed trigger mutation and its pending receipt state.
 */
export function useJobTrigger<Name extends JobTriggerName, Context = unknown>(
  name: Name,
  options: JobMutationOptions<
    JobTriggerOutputFor<Name>,
    JobFailureFor<Name>,
    JobTriggerInputFor<Name>,
    Context
  > = {},
): UseMutationResult<
  JobTriggerOutputFor<Name>,
  JobFailureFor<Name>,
  JobTriggerInputFor<Name>,
  Context
> {
  const runtime = useRelkitClient();
  const { jobId, ...mutationOptions } = options;
  const generated = procedureUtils(runtime.utils, [
    "jobs",
    name,
    "trigger",
  ]).mutationOptions() as Record<string, unknown>;
  const original = generated.mutationFn as (
    input: unknown,
    context: unknown,
  ) => Promise<JobTriggerOutputFor<Name>>;
  return useMutation({
    ...generated,
    ...mutationOptions,
    retry: mutationOptions.retry ?? false,
    networkMode: mutationOptions.networkMode ?? "always",
    mutationFn: async (input, mutationContext) => {
      const scope = writableScope(runtime);
      if (offline()) throw new RelkitWriteError("not-sent", "The browser is offline.");
      const prepared = prepareJobRequest(input, runtime.identity!, mutationContext);
      const scopeKey = pendingScopeKey(scope);
      return (await runExecutionPromise(
        mutationRuntime,
        mutationOperations.submit(
          scopeKey,
          "job-trigger",
          name,
          prepared.value,
          {},
          {
            operationId: prepared.operationId,
            retainRequest: true,
            ...(prepared.idempotencyKey === undefined
              ? {}
              : { idempotencyKey: prepared.idempotencyKey }),
          },
          () => original(prepared.value, mutationContext),
        ),
      )) as JobTriggerOutputFor<Name>;
    },
    mutationKey: runtime.scope
      ? relkitJobKey(runtime.scope, "trigger", { jobId: jobId ?? name })
      : ["relkit", "blocked", "job", name],
  } as UseMutationOptions<
    JobTriggerOutputFor<Name>,
    JobFailureFor<Name>,
    JobTriggerInputFor<Name>,
    Context
  >);
}

/**
 * Adapts an idempotent job cancellation request into TanStack mutation state.
 * @typeParam Name - Declared resource or procedure selector.
 * @typeParam Context - TanStack mutation context.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The typed cancellation mutation.
 */
export function useJobCancel<Name extends JobCancelName, Context = unknown>(
  name: Name,
  options: JobMutationOptions<
    JobCancelOutputFor<Name>,
    JobFailureFor<Name>,
    JobCancelInputFor<Name>,
    Context
  > = {},
): UseMutationResult<
  JobCancelOutputFor<Name>,
  JobFailureFor<Name>,
  JobCancelInputFor<Name>,
  Context
> {
  return useJobControl(name, "cancel", options);
}

/**
 * Adapts an explicit job retry request into TanStack mutation state.
 * @typeParam Name - Declared resource or procedure selector.
 * @typeParam Context - TanStack mutation context.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The typed retry mutation.
 */
export function useJobRetry<Name extends JobRetryName, Context = unknown>(
  name: Name,
  options: JobMutationOptions<
    JobRetryOutputFor<Name>,
    JobFailureFor<Name>,
    JobRetryInputFor<Name>,
    Context
  > = {},
): UseMutationResult<
  JobRetryOutputFor<Name>,
  JobFailureFor<Name>,
  JobRetryInputFor<Name>,
  Context
> {
  return useJobControl(name, "retry", options);
}

/**
 * Builds the shared cancellation/retry mutation adapter with complete scope keys.
 * @typeParam Name - Declared resource or procedure selector.
 * @typeParam Operation - Declared Operation type retained by this operation.
 * @typeParam Input - Declared transmitted input.
 * @typeParam Output - Declared successful output payload.
 * @typeParam Context - TanStack mutation context.
 * @param name - Declared resource or selector identity.
 * @param operation - One native boundary operation.
 * @param options - Existing public configuration and authority.
 * @returns The typed control mutation with canonical scope keys.
 */
function useJobControl<
  Name extends JobCancelName | JobRetryName,
  Operation extends "cancel" | "retry",
  Input,
  Output,
  Context,
>(
  name: Name,
  operation: Operation,
  options: JobMutationOptions<Output, JobFailureFor<Name>, Input, Context>,
): UseMutationResult<Output, JobFailureFor<Name>, Input, Context> {
  const runtime = useRelkitClient();
  const { jobId, ...mutationOptions } = options;
  const generated = procedureUtils(runtime.utils, [
    "jobs",
    name,
    "runs",
    operation,
  ]).mutationOptions() as Record<string, unknown>;
  const original = generated.mutationFn as (input: Input, context: unknown) => Promise<Output>;
  return useMutation({
    ...generated,
    ...mutationOptions,
    retry: mutationOptions.retry ?? false,
    networkMode: mutationOptions.networkMode ?? "always",
    mutationFn: async (input, mutationContext) => {
      const scope = writableScope(runtime);
      if (offline()) throw new RelkitWriteError("not-sent", "The browser is offline.");
      const scopeKey = pendingScopeKey(scope);
      const operationId = readOperationId(input);
      return (await runExecutionPromise(
        mutationRuntime,
        mutationOperations.submit(
          scopeKey,
          "mutation",
          `jobs.${name}.runs.${operation}`,
          input,
          controlReferences(input),
          operationId === undefined ? {} : { operationId },
          () => original(input, mutationContext),
        ),
      )) as Output;
    },
    mutationKey: runtime.scope
      ? relkitJobKey(runtime.scope, operation, { jobId: jobId ?? name })
      : ["relkit", "blocked", "job", name, operation],
  } as UseMutationOptions<Output, JobFailureFor<Name>, Input, Context>);
}
