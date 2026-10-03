import { JOBS_ADAPTER_PROTOCOL_VERSION } from "@relkit/jobs/adapter";
import type { NativeJobEffects } from "./native.service.types.js";

/**
 * Declares capabilities supported by the local native task implementation.
 * @param profile - Local profile used in the public service identity.
 * @returns Protocol metadata without claiming external cancellation or process recovery beyond local state.
 */
export function nativeJobMetadata(profile: string): NativeJobEffects["metadata"] {
  return {
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
  };
}
