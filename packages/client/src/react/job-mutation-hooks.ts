"use client";

import type { PendingOperationMetadata } from "@relkit/contracts";
import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { ORPCError } from "../index.js";
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
} from "../jobs/index.js";
import { useRelkitClient, type RelkitClientRuntime } from "./context.js";
import { relkitJobKey } from "./keys.js";
import {
  forgetPending,
  jobUnknownOutcome,
  pendingScopeKey,
  rememberJobPending,
  rememberPending,
  updatePending,
} from "./pending.js";
import { procedureUtils } from "./procedure.js";
import { RelkitWriteError } from "./finite-hooks.js";
import { prepareJobRequest, readOperationId, readRunId } from "./job-hooks-support.js";

export type JobMutationOptions<Output, Failure, Input, Context> = Omit<
  UseMutationOptions<Output, Failure, Input, Context>,
  "mutationKey" | "mutationFn"
> & { readonly jobId?: string };

export function useJobTrigger<Name extends JobTriggerName, Context = unknown>(
  name: Name,
  options: JobMutationOptions<
    JobTriggerOutputFor<Name>,
    JobFailureFor<Name>,
    JobTriggerInputFor<Name>,
    Context
  > = {},
): UseMutationResult<JobTriggerOutputFor<Name>, JobFailureFor<Name>, JobTriggerInputFor<Name>, Context> {
  const runtime = useRelkitClient();
  const { jobId, ...mutationOptions } = options;
  const generated = procedureUtils(runtime.utils, ["jobs", name, "trigger"]).mutationOptions() as Record<
    string,
    unknown
  >;
  const original = generated.mutationFn as (input: unknown, context: unknown) => Promise<JobTriggerOutputFor<Name>>;
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
      const pending = await rememberJobPending(scopeKey, name, prepared.value, {
        operationId: prepared.operationId,
        ...(prepared.idempotencyKey === undefined ? {} : { idempotencyKey: prepared.idempotencyKey }),
      });
      try {
        const value = await original(prepared.value, mutationContext);
        forgetPending(scopeKey, pending.operationId);
        return value;
      } catch (error) {
        settlePending(scopeKey, pending, error);
        throw error;
      }
    },
    mutationKey: runtime.scope
      ? relkitJobKey(runtime.scope, "trigger", { jobId: jobId ?? name })
      : ["relkit", "blocked", "job", name],
  } as UseMutationOptions<JobTriggerOutputFor<Name>, JobFailureFor<Name>, JobTriggerInputFor<Name>, Context>);
}

export function useJobCancel<Name extends JobCancelName, Context = unknown>(
  name: Name,
  options: JobMutationOptions<JobCancelOutputFor<Name>, JobFailureFor<Name>, JobCancelInputFor<Name>, Context> = {},
): UseMutationResult<JobCancelOutputFor<Name>, JobFailureFor<Name>, JobCancelInputFor<Name>, Context> {
  return useJobControl(name, "cancel", options);
}

export function useJobRetry<Name extends JobRetryName, Context = unknown>(
  name: Name,
  options: JobMutationOptions<JobRetryOutputFor<Name>, JobFailureFor<Name>, JobRetryInputFor<Name>, Context> = {},
): UseMutationResult<JobRetryOutputFor<Name>, JobFailureFor<Name>, JobRetryInputFor<Name>, Context> {
  return useJobControl(name, "retry", options);
}

function useJobControl<Name extends JobCancelName | JobRetryName, Operation extends "cancel" | "retry", Input, Output, Context>(
  name: Name,
  operation: Operation,
  options: JobMutationOptions<Output, JobFailureFor<Name>, Input, Context>,
): UseMutationResult<Output, JobFailureFor<Name>, Input, Context> {
  const runtime = useRelkitClient();
  const { jobId, ...mutationOptions } = options;
  const generated = procedureUtils(runtime.utils, ["jobs", name, "runs", operation]).mutationOptions() as Record<
    string,
    unknown
  >;
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
      const pending = await rememberPending(
        scopeKey,
        "mutation",
        `jobs.${name}.runs.${operation}`,
        input,
        controlReferences(input),
        operationId === undefined ? {} : { operationId },
      );
      try {
        const value = await original(input, mutationContext);
        forgetPending(scopeKey, pending.operationId);
        return value;
      } catch (error) {
        settlePending(scopeKey, pending, error);
        throw error;
      }
    },
    mutationKey: runtime.scope
      ? relkitJobKey(runtime.scope, operation, { jobId: jobId ?? name })
      : ["relkit", "blocked", "job", name, operation],
  } as UseMutationOptions<Output, JobFailureFor<Name>, Input, Context>);
}

function writableScope(runtime: RelkitClientRuntime): NonNullable<RelkitClientRuntime["scope"]> {
  if (runtime.status !== "ready" || runtime.scope === undefined || runtime.identity === undefined) {
    throw new RelkitWriteError("not-sent", `Relkit client is not ready (${runtime.status})`);
  }
  return runtime.scope;
}

function settlePending(scopeKey: string, pending: PendingOperationMetadata, error: unknown): void {
  const unknown = jobUnknownOutcome(error);
  if (unknown !== undefined) {
    updatePending(scopeKey, {
      ...pending,
      state: "unknown",
      ...(unknown.idempotencyKey === undefined ? {} : { idempotencyKey: unknown.idempotencyKey }),
      recovery: unknown.recovery,
    });
  } else if (error instanceof ORPCError) {
    forgetPending(scopeKey, pending.operationId);
  } else {
    updatePending(scopeKey, { ...pending, state: "unknown" });
  }
}

function controlReferences(input: unknown): { readonly runId?: string } {
  const runId = readRunId(input);
  return runId === undefined ? {} : { runId };
}

function offline(): boolean {
  return (globalThis as { navigator?: { readonly onLine?: boolean } }).navigator?.onLine === false;
}
