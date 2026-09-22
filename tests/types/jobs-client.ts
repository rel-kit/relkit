import {
  useRoute,
  useRouteMutation,
  useStream,
  useJobCancel,
  useJobRetry,
  useJobRun,
  useJobTrigger,
  type JobContract,
  type JobProcedureSelector,
} from "@relkit/client/react";
import type { PendingOperationMetadata } from "@relkit/contracts";
import type { RunHandle } from "@relkit/contracts/jobs";
import type { JobRegistry } from "@relkit/client/jobs";

declare module "@relkit/client/jobs" {
  interface JobRegistry {
    readonly exportOrders: JobContract<
      "exportOrders",
      "orders.export",
      { readonly orderId: string },
      { readonly url: string },
      { readonly code: "failed"; readonly message: string },
      { readonly completed: number },
      { readonly text: string },
      readonly ["trigger", "get", "list", "watch", "stream", "cancel", "retry"],
      readonly ["status", "output", "progress"]
    >;
  }
}

declare module "@relkit/client/react" {
  interface ClientRegistry {
    readonly "jobs.exportOrders.trigger": {
      readonly input: { readonly input: { readonly orderId: string } };
      readonly output: import("@relkit/contracts/jobs").RunHandle;
      readonly error: Error;
      readonly operation: "mutation";
      readonly stream: false;
    };
    readonly "jobs.exportOrders.runs.get": {
      readonly input: { readonly runId: string };
      readonly output: import("@relkit/client/jobs").JobSnapshotFor<
        { readonly orderId: string },
        { readonly url: string },
        { readonly completed: number },
        Error,
        readonly ["status", "output", "progress"]
      >;
      readonly error: Error;
      readonly operation: "query";
      readonly stream: false;
    };
    readonly "jobs.exportOrders.runs.watch": {
      readonly input: { readonly runId: string };
      readonly output: AsyncIterable<import("@relkit/contracts/jobs").RunWatchFrame>;
      readonly item: import("@relkit/contracts/jobs").RunWatchFrame;
      readonly error: Error;
      readonly operation: "query";
      readonly stream: true;
    };
  }
}

declare const selectors: JobProcedureSelector<"exportOrders">;
declare const registry: JobRegistry;
void selectors;
void registry.exportOrders.trigger;

useRouteMutation("jobs.exportOrders.trigger").mutate({ input: { orderId: "order-1" } });
useRoute("jobs.exportOrders.runs.get", { input: { runId: "run-1" } });
useStream("jobs.exportOrders.runs.watch", { input: { runId: "run-1" } });
useJobTrigger("exportOrders").mutate({ input: { orderId: "order-1" } });
useJobRun("exportOrders", { runId: "run-1", enabled: false }).run?.status;
useJobCancel("exportOrders").mutate({ runId: "run-1", operationId: "operation-1" });
useJobRetry("exportOrders").mutate({ runId: "run-1", operationId: "operation-1" });

const acceptedRun: RunHandle = {
  accepted: true,
  runId: "run-accepted",
  jobId: "orders.export",
  taskId: "orders.export",
  taskVersion: "1",
  acceptedAt: "2026-01-01T00:00:00.000Z",
};

function correctedReactJobFixture(pending: PendingOperationMetadata) {
  const trigger = useJobTrigger("exportOrders");
  const originalRequest = {
    input: { orderId: "order-1" },
    options: { operationId: "operation-1", idempotencyKey: "order-1" },
  } satisfies Parameters<typeof trigger.mutate>[0];
  const run = useJobRun("exportOrders", { runId: acceptedRun.runId, enabled: false });
  const message =
    pending.state !== "unknown"
      ? "Submission pending"
      : pending.recovery?.action === "retry-with-same-key"
        ? "Outcome unknown; retry only with the same key"
        : pending.recovery?.action === "inspect-native"
          ? "Outcome unknown; inspect the provider"
          : "Outcome unknown; wait for provider recovery";
  return {
    message,
    operationId: pending.operationId,
    originalRequest,
    runId: run.run?.runId ?? acceptedRun.runId,
  };
}
void correctedReactJobFixture;

// @ts-expect-error hook names must have their declared operation
useJobTrigger("hiddenJob");

// @ts-expect-error private or ungenerated job selectors are rejected
useRoute("jobs.hiddenJob.runs.get", { input: { runId: "run-1" } });
// @ts-expect-error arbitrary provider selectors are not browser contract keys
useRouteMutation("jobs.local.runs.get");
