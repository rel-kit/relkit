import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  type ProviderAdapter,
} from "@relkit/provider";

const event = defineProviderCapability("event");
const job = defineProviderCapability("job");
const integration = defineIntegrationReference("local");
const connectionContract = defineConnectionContract({
  root: { default: ".relkit/state", authoredValue: "fixed" },
});

export interface LocalProviderOptions {
  readonly root?: string;
}

export type LocalEventAdapter = ProviderAdapter<typeof event, "local-event">;
export type LocalJobAdapter = ProviderAdapter<typeof job, "local-job">;

/**
 * Defines the durable filesystem event provider used by local development.
 *
 * @example
 * ```ts
 * import { localEvent } from "@relkit/local";
 * const events = localEvent();
 * ```
 * @category Integrations
 * @since 0.4.0
 */
export function localEvent(options: LocalProviderOptions = {}): LocalEventAdapter {
  return adapter(event, "local-event", options) as LocalEventAdapter;
}

/**
 * Defines the durable filesystem queue provider for unscheduled local jobs.
 *
 * @example
 * ```ts
 * import { localJob } from "@relkit/local";
 * const jobs = localJob();
 * ```
 * @category Integrations
 * @since 0.4.0
 */
export function localJob(options: LocalProviderOptions = {}): LocalJobAdapter {
  return adapter(job, "local-job", options) as LocalJobAdapter;
}

function adapter(
  capability: typeof event | typeof job,
  adapterId: "local-event" | "local-job",
  options: LocalProviderOptions,
): ProviderAdapter {
  if (options.root !== undefined && options.root.trim() === "") {
    throw new TypeError("Local provider root must be a non-empty path");
  }
  return defineProviderAdapter({
    integration,
    capability,
    adapterId,
    connectionContract,
    connection: options.root === undefined ? {} : { root: options.root },
    behavior: defineProviderBehavior({}),
  });
}
