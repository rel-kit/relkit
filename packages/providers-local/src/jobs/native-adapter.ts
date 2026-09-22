import { join } from "node:path";
import { JOBS_ADAPTER_PROTOCOL_VERSION, type JobsAdapterRuntime } from "@relkit/jobs/adapter";
import { cancelRun, retryRun } from "./native-adapter-controls.js";
import { createRun, handle, listRuns, newRunId, snapshot } from "./native-adapter-runs.js";
import { controlKey, requestKey, sameNamespace } from "./native-adapter-support.js";
import {
  openNativeStore,
  persistNativeControl,
  persistNativeRun,
} from "./native-adapter-storage.js";
import type { LocalNativeState } from "./native-adapter-types.js";
import { completeRun, failRun, nextRun, observeRun, suspendRun } from "./native-adapter-work.js";

export function createLocalNativeJobProvider(root: string, profile: string): JobsAdapterRuntime {
  const state: LocalNativeState = {
    runs: new Map(),
    idempotency: new Map(),
    retryControls: new Map(),
    cancelControls: new Map(),
  };
  let closed = false;
  let storePromise: Promise<import("./store.js").JobStore> | undefined;
  let tail = Promise.resolve();
  const adapter: JobsAdapterRuntime = {
    kind: "jobs-adapter-runtime",
    protocolVersion: JOBS_ADAPTER_PROTOCOL_VERSION,
    capabilities: {
      service: `local:${profile}`,
      provider: "local",
      adapterId: "local-task",
      protocolVersion: 1,
      features: {
        submission: true,
        read: true,
        list: true,
        observation: true,
        cancel: true,
        retry: true,
        "durable-sleep": true,
      },
    },
    submit: (request, context) =>
      serialize(async () => {
        ensureOpen();
        assertRequestScope(request, context);
        const store = await readyStore();
        const key = requestKey(request, context);
        const existing = key === undefined ? undefined : state.idempotency.get(key);
        if (existing !== undefined)
          return { ...handle(state.runs.get(existing)!), duplicate: true };
        const run = createRun(request, context, newRunId(`local-${profile}`));
        await persistNativeRun(store, run);
        state.runs.set(run.runId, run);
        if (key !== undefined) state.idempotency.set(key, run.runId);
        return handle(run);
      }),
    get: async (locator, context) => {
      await readyStore();
      const run = state.runs.get(locator);
      if (run === undefined || !sameNamespace(run, context))
        throw new Error("Native run was not found");
      return snapshot(run);
    },
    list: async (query, context) => {
      await readyStore();
      return listRuns(state, query, context);
    },
    observe: (request, context) => observeAfterReady(request, context),
    cancel: (request, context) =>
      serialize(async () => {
        ensureOpen();
        const store = await readyStore();
        const receipt = await cancelRun(state, request, context);
        const run = state.runs.get(request.runId);
        if (run !== undefined) await persistNativeRun(store, run);
        await persistNativeControl(
          store,
          "cancel",
          controlKey("cancel", request.runId, request.operationId, context),
          receipt,
        );
        return receipt;
      }),
    retry: (request, context) =>
      serialize(async () => {
        ensureOpen();
        const store = await readyStore();
        const receipt = await retryRun(state, request, context);
        const retryRunValue = "runId" in receipt ? state.runs.get(receipt.runId) : undefined;
        if (retryRunValue !== undefined) await persistNativeRun(store, retryRunValue);
        await persistNativeControl(
          store,
          "retry",
          controlKey("retry", request.runId, request.operationId, context),
          receipt,
        );
        return receipt;
      }),
    worker: {
      next: (context) =>
        serialize(async () => {
          const store = await readyStore();
          const work = await nextRun(state, context);
          if (work !== undefined)
            await persistNativeRun(store, state.runs.get(work.envelope.runId)!);
          return work;
        }),
      complete: (runId, output, context) =>
        serialize(async () => {
          const store = await readyStore();
          await completeRun(state, runId, output, context);
          const run = state.runs.get(runId);
          if (run !== undefined) await persistNativeRun(store, run);
        }),
      fail: (runId, error, context) =>
        serialize(async () => {
          const store = await readyStore();
          await failRun(state, runId, error, context);
          const run = state.runs.get(runId);
          if (run !== undefined) await persistNativeRun(store, run);
        }),
      suspend: (runId, value, context) =>
        serialize(async () => {
          const store = await readyStore();
          await suspendRun(state, runId, value, context);
          const run = state.runs.get(runId);
          if (run !== undefined) await persistNativeRun(store, run);
        }),
    },
    close: async () => {
      closed = true;
      await tail;
      const store = storePromise === undefined ? undefined : await storePromise;
      await store?.close();
    },
  };
  return Object.freeze(adapter);

  async function* observeAfterReady(
    request: Parameters<NonNullable<JobsAdapterRuntime["observe"]>>[0],
    context: Parameters<NonNullable<JobsAdapterRuntime["observe"]>>[1],
  ) {
    await readyStore();
    yield* observeRun(state, request, context);
  }

  async function readyStore() {
    storePromise ??= openNativeStore(join(root, "jobs", profile, "native"), state).then(
      async (store) => {
        for (const run of state.runs.values()) {
          if (run.status === "running") {
            run.status = "queued";
            run.nextEligibleAt = new Date().toISOString();
            delete run.controller;
            delete run.controllerCleanup;
            await persistNativeRun(store, run);
          }
          const key = requestKey(run.request, run.namespace);
          if (key !== undefined) state.idempotency.set(key, run.runId);
        }
        return store;
      },
    );
    return storePromise;
  }

  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function assertRequestScope(
    request: { readonly scope?: string },
    context: { readonly scope: string },
  ): void {
    if (request.scope !== undefined && request.scope !== context.scope) {
      throw new Error("Native submission scope does not match the operation scope");
    }
  }

  function ensureOpen(): void {
    if (closed) throw new Error("Local native jobs adapter is closed");
  }
}
