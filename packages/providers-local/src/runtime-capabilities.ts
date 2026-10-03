import type { LocalJobProvider } from "./runtime-capabilities.types.js";
import type { JsonValue } from "@relkit/contracts";
import type { JobsAdapterRuntime } from "@relkit/jobs/adapter";
import { createLocalNativeJobProvider } from "./jobs/native-adapter.js";
import { makeLegacyJobService, makeObservabilityService } from "./runtime-capabilities.service.js";
import { runLocal, runLocalSync } from "./local-effect.js";

export type { LocalJobProvider } from "./runtime-capabilities.types.js";

/** Creates a profile-owned durable queue provider through its established synchronous constructor.
 * @param root - Owned state directory.
 * @param profile - Local provider profile partition.
 * @returns The profile-owned legacy queue provider.
 */
export function createLocalJobProvider(root: string, profile: string): LocalJobProvider;
/** Composes the selected local job model behind its existing public runtime contract.
 * @param root - Owned state directory.
 * @param profile - Local provider profile partition.
 * @param executionModel - Requested local job execution model.
 * @returns The native task adapter for this profile.
 */
export function createLocalJobProvider(
  root: string,
  profile: string,
  executionModel: "task",
): JobsAdapterRuntime;
/**
 * Constructs the selected local job model through its existing public overloads.
 * @param root - Owned local state directory.
 * @param profile - Local job profile partition.
 * @param executionModel - Optional native task execution selector.
 * @returns The selected legacy queue provider or native task adapter.
 */
export function createLocalJobProvider(
  root: string,
  profile: string,
  executionModel?: "task",
): LocalJobProvider | JobsAdapterRuntime {
  if (executionModel === "task") return createLocalNativeJobProvider(root, profile);
  const service = runLocalSync(makeLegacyJobService(root, profile));
  return Object.freeze({
    createQueue: (context: Parameters<LocalJobProvider["createQueue"]>[0]) =>
      runLocal(service.createQueue(context)),
    close: () => runLocal(service.close()),
  });
}

/** Creates an isolated synchronous JSON collector without recursively observing sink writes.
 * @returns The isolated synchronous collector and snapshot reader.
 */
export function createLocalObservabilityProvider() {
  const service = runLocalSync(makeObservabilityService);
  return Object.freeze({
    collect: (record: JsonValue): void => {
      runLocalSync(service.collect(record));
    },
    emit: (record: JsonValue): void => {
      runLocalSync(service.collect(record));
    },
    read: (): readonly JsonValue[] => runLocalSync(service.read()),
  });
}
