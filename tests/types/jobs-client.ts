import {
  useRoute,
  useRouteMutation,
  useStream,
  type JobContract,
  type JobProcedureSelector,
} from "@relkit/client/react";
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

// @ts-expect-error private or ungenerated job selectors are rejected
useRoute("jobs.hiddenJob.runs.get", { input: { runId: "run-1" } });
// @ts-expect-error arbitrary provider selectors are not browser contract keys
useRouteMutation("jobs.local.runs.get");
