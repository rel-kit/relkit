import type { LocalServiceInstance } from "@relkit/local-service";
import type { LocalServiceReconcilerOptions } from "./reconciler-types.js";
import { serviceInstanceIds } from "./reconciler-support.js";

export async function removeInstance(
  options: LocalServiceReconcilerOptions,
  instance: LocalServiceInstance,
  signal?: AbortSignal,
): Promise<void> {
  for (const id of [...serviceInstanceIds(instance)].reverse()) {
    if (options.materializer.stop !== undefined) await options.materializer.stop(id, signal).catch(() => undefined);
    await options.materializer.remove(id, signal);
  }
}
