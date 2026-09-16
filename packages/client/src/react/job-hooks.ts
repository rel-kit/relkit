"use client";

import type { ExpectedClientIdentity } from "@relkit/contracts";
import type { RunSnapshot } from "@relkit/contracts/jobs";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type {
  JobRunFor,
  JobWatchName,
  JobWatchController,
  JobWatchOptions,
  JobWatchState,
} from "../jobs/index.js";
import { JobWatchUnavailableError, watchJobRun } from "../jobs/index.js";
import { useRelkitClient, type RelkitClientRuntime } from "./context.js";

export type { JobMutationOptions } from "./job-mutation-hooks.js";
export { useJobCancel, useJobRetry, useJobTrigger } from "./job-mutation-hooks.js";

export interface UseJobRunOptions
  extends Omit<
    JobWatchOptions,
    "runId" | "expectedIdentity" | "identityKey" | "applicationId" | "protocolVersion"
  > {
  readonly runId?: string;
  readonly enabled?: boolean;
  readonly autoConnect?: boolean;
  readonly expectedIdentity?: ExpectedClientIdentity;
}

export interface UseJobRunResult<Run = RunSnapshot> extends JobWatchState<Run> {
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly refetch: () => Promise<void>;
}

export function useJobRun<Name extends JobWatchName>(
  name: Name,
  options: UseJobRunOptions = {},
): UseJobRunResult<JobRunFor<Name>> {
  const runtime = useRelkitClient();
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
        : (watchJobRun(runtime.streamClient, name, watchOptions) as JobWatchController<JobRunFor<Name>>),
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
    return () => {
      void controller.disconnect();
    };
  }, [controller]);
  useEffect(() => {
    if (controller === undefined || options.enabled === false || options.autoConnect === false) return;
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

function buildWatchOptions(runtime: RelkitClientRuntime, options: UseJobRunOptions): JobWatchOptions | undefined {
  const identity = runtime.identity;
  if (options.runId === undefined || runtime.status !== "ready" || identity === undefined) return undefined;
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
    ...(options.maxReconnectAttempts === undefined ? {} : { maxReconnectAttempts: options.maxReconnectAttempts }),
    ...(options.reconnectMinDelayMs === undefined ? {} : { reconnectMinDelayMs: options.reconnectMinDelayMs }),
    ...(options.reconnectMaxDelayMs === undefined ? {} : { reconnectMaxDelayMs: options.reconnectMaxDelayMs }),
    ...(options.readTimeoutMs === undefined ? {} : { readTimeoutMs: options.readTimeoutMs }),
  };
}

function unavailable(): Promise<never> {
  return Promise.reject(new JobWatchUnavailableError());
}

const EMPTY_STATE: JobWatchState<RunSnapshot> = Object.freeze({ connection: "idle", isStale: false });
