"use client";

import type { UseJobRunOptions, UseJobRunResult } from "./job-hooks.types.js";
export type { UseJobRunOptions, UseJobRunResult } from "./job-hooks.types.js";

import type { RunSnapshot } from "@relkit/contracts/jobs";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { JobRunFor, JobWatchName } from "../jobs/job-registry-derived.types.js";
import type { JobWatchController, JobWatchOptions, JobWatchState } from "../jobs/types.js";
import { JobWatchUnavailableError } from "../jobs/types.js";
import { watchJobRun } from "../jobs/controller.js";
import { useRelkitClient, type RelkitClientRuntime } from "./context.js";
import { borrowViewOwner } from "./view-owner.js";

export type { JobMutationOptions } from "./job-mutation-hooks.js";
export { useJobCancel, useJobRetry, useJobTrigger } from "./job-mutation-hooks.js";

/**
 * Borrows an idle scoped job controller and exposes its frozen external-store state.
 * @typeParam Name - Declared resource or procedure selector.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @returns The frozen run snapshot and explicit controller controls.
 */
export function useJobRun<Name extends JobWatchName>(
  name: Name,
  options: UseJobRunOptions = {},
): UseJobRunResult<JobRunFor<Name>> {
  const runtime = useRelkitClient();
  const owners = useRef(new WeakMap<object, object>());
  const watchOptions = useMemo(
    () => buildWatchOptions(runtime, options),
    [
      runtime,
      options.runId,
      options.after,
      options.expectedIdentity,
      options.environment,
      options.grantScope,
      options.projection,
      options.schemaVersion,
      options.source,
      options.pollIntervalMs,
      options.maxReconnectAttempts,
      options.reconnectMinDelayMs,
      options.reconnectMaxDelayMs,
      options.readTimeoutMs,
      options.jobId,
    ],
  );
  const controller = useMemo<JobWatchController<JobRunFor<Name>> | undefined>(
    () =>
      watchOptions === undefined
        ? undefined
        : (watchJobRun(runtime.streamClient, name, watchOptions) as JobWatchController<
            JobRunFor<Name>
          >),
    [runtime.streamClient, name, watchOptions],
  );
  const subscribe = useCallback(
    (listener: (state: JobWatchState<JobRunFor<Name>>) => void) =>
      controller?.subscribe(listener) ?? (() => undefined),
    [controller],
  );
  const getSnapshot = useCallback(
    () => controller?.getSnapshot() ?? (EMPTY_STATE as JobWatchState<JobRunFor<Name>>),
    [controller],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (controller === undefined) return;
    const retire = borrowViewOwner(
      controller,
      () => {
        void controller.dispose();
      },
      owners.current,
    );
    return () => {
      void controller.disconnect();
      retire();
    };
  }, [controller]);
  useEffect(() => {
    if (controller === undefined || options.enabled === false || options.autoConnect === false)
      return;
    void controller.connect().catch(() => undefined);
  }, [controller, options.autoConnect, options.enabled]);

  const connect = useCallback(() => controller?.connect() ?? unavailable(), [controller]);
  const disconnect = useCallback(
    () => (controller === undefined ? Promise.resolve() : controller.disconnect()),
    [controller],
  );
  const refetch = useCallback(() => controller?.refetch() ?? unavailable(), [controller]);
  return { ...state, connect, disconnect, refetch };
}

/**
 * Combines current identity and explicit options into complete watch authority.
 * @param runtime - Existing runtime supplied by the owning operation.
 * @param options - Existing public configuration and authority.
 * @returns Scope-complete watch options, or undefined until identity is ready.
 */
function buildWatchOptions(
  runtime: RelkitClientRuntime,
  options: UseJobRunOptions,
): JobWatchOptions | undefined {
  const identity = runtime.identity;
  if (options.runId === undefined || runtime.status !== "ready" || identity === undefined)
    return undefined;
  const expectedIdentity = options.expectedIdentity ?? {
    identityScope: identity.identityScope,
    sessionEpoch: identity.sessionEpoch,
  };
  const environment = options.environment ?? runtime.environment;
  return {
    runId: options.runId,
    ...(options.jobId === undefined ? {} : { jobId: options.jobId }),
    ...(options.after === undefined ? {} : { after: options.after }),
    expectedIdentity,
    ...(runtime.identityKey === undefined ? {} : { identityKey: runtime.identityKey }),
    applicationId: identity.applicationId,
    ...(environment === undefined ? {} : { environment }),
    ...(identity.jobs === undefined ? {} : { protocolVersion: identity.jobs.version }),
    ...(options.grantScope === undefined ? {} : { grantScope: options.grantScope }),
    ...(options.projection === undefined ? {} : { projection: options.projection }),
    ...(options.schemaVersion === undefined ? {} : { schemaVersion: options.schemaVersion }),
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
    ...(options.maxReconnectAttempts === undefined
      ? {}
      : { maxReconnectAttempts: options.maxReconnectAttempts }),
    ...(options.reconnectMinDelayMs === undefined
      ? {}
      : { reconnectMinDelayMs: options.reconnectMinDelayMs }),
    ...(options.reconnectMaxDelayMs === undefined
      ? {}
      : { reconnectMaxDelayMs: options.reconnectMaxDelayMs }),
    ...(options.readTimeoutMs === undefined ? {} : { readTimeoutMs: options.readTimeoutMs }),
  };
}

/**
 * Rejects observation when no usable run identity is available.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
function unavailable(): Promise<never> {
  return Promise.reject(new JobWatchUnavailableError());
}

const EMPTY_STATE: JobWatchState<RunSnapshot> = Object.freeze({
  connection: "idle",
  isStale: false,
});
