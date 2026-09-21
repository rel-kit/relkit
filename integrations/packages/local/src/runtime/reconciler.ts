import { localProjectLabels } from "./identity.js";
import { removeProviderOverrides } from "./provider-overrides.js";
import type { LocalServiceReconciler, LocalServiceReconcilerOptions } from "./reconciler-types.js";
import { removeLocalServiceState } from "./service-state.js";
import { createReconcileOperation, type TrackedService } from "./reconciler-operation.js";
import { createReconcileQueue } from "./reconciler-queue.js";
import { removeInstance } from "./reconciler-resource.js";

export * from "./reconciler-types.js";

export function createLocalServiceReconciler(
  options: LocalServiceReconcilerOptions,
): LocalServiceReconciler {
  const projectLabels = localProjectLabels(options.identity);
  const tracked = new Map<string, TrackedService>();
  const signatures = new Map<string, string>();
  let closed = false;
  const reconcileNow = createReconcileOperation(
    options,
    projectLabels,
    tracked,
    signatures,
    () => closed,
  );
  const queue = createReconcileQueue(reconcileNow);
  const reconciler: LocalServiceReconciler = {
    reconcile: queue.enqueue,
    close: async () => {
      if (closed) return;
      closed = true;
      await queue.wait();
      await Promise.allSettled(
        [...tracked.values()]
          .filter((service) => service.owned)
          .map((service) => removeInstance(options, service.instance)),
      );
      if (options.preserveOnClose !== true) {
        removeProviderOverrides(options.identity);
        removeLocalServiceState(options.identity);
      }
      tracked.clear();
      signatures.clear();
    },
  };
  return Object.freeze(reconciler);
}
