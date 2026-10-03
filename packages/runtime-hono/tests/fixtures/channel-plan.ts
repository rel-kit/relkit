import type { RegistrationPlan } from "@relkit/graph";
import type { RuntimeManifest } from "../../src/index.ts";
import { runtimeCohort } from "../test-cohort.ts";
export function channelPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:realtime",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    channels: [
      {
        kind: "channel",
        id: "orders.updates",
        source: { file: "channel.ts", line: 1, column: 1 },
        params: {},
        events: {},
        profile: "default",
        client: "protected",
        replay: { retentionMs: 300_000, maxEvents: 100 },
      },
    ],
    middlewares: [],
  };
}

export function manifest(plan: RegistrationPlan, channel: unknown): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    channels: { "orders.updates": channel },
    middleware: {},
    requestTransforms: {},
  };
}
