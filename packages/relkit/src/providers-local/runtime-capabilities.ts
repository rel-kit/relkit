import type { JsonValue } from "../contracts/index.js";
import type { JobsAdapterRuntime } from "../jobs/adapter.js";
import { createLocalNativeJobProvider } from "./jobs/native-adapter.js";
import { makeObservabilityService } from "./runtime-capabilities.service.js";
import { runLocalSync } from "./local-effect.js";

/** Creates the local native task jobs adapter for one profile.
 * @param root - Owned state directory.
 * @param profile - Local provider profile partition.
 * @returns The native task adapter for this profile.
 */
export function createLocalJobProvider(root: string, profile: string): JobsAdapterRuntime {
  return createLocalNativeJobProvider(root, profile);
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
