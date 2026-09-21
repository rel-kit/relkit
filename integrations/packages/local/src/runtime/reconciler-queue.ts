import type {
  LocalServiceReconcileRequest,
  LocalServiceReconcileResult,
} from "./reconciler-types.js";

export interface ReconcileQueue {
  readonly enqueue: (request: LocalServiceReconcileRequest) => Promise<LocalServiceReconcileResult>;
  readonly wait: () => Promise<void>;
}

export function createReconcileQueue(
  reconcile: (request: LocalServiceReconcileRequest) => Promise<LocalServiceReconcileResult>,
): ReconcileQueue {
  let tail: Promise<void> = Promise.resolve();
  return Object.freeze({
    enqueue: (request: LocalServiceReconcileRequest) => {
      const run = tail.then(() => reconcile(request));
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    wait: () => tail,
  });
}
