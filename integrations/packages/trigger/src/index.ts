import {
  defineConnectionContract,
  defineIntegrationReference,
  defineLocalRecipeReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  defineProviderFeature,
  isBindingValueRef,
  type BindingValueRef,
  type ProviderAdapter,
  type ProviderBehavior,
  type ProviderConnectionValues,
} from "@relkit/provider";
import {
  serializeJobsServiceOptions,
  validateJobsServiceOptions,
  type JobsServiceBehavior,
  type JobsServiceOptions,
} from "@relkit/jobs";

const job = defineProviderCapability("job");
const durable = defineProviderFeature(job, "durable");
const retryable = defineProviderFeature(job, "retryable");
const integration = defineIntegrationReference("trigger");
const localRecipe = defineLocalRecipeReference(integration, "trigger-docker", 2);
const connectionContract = defineConnectionContract({
  projectRef: { required: false, authoredValue: "fallback" },
  secretKey: { required: false, sensitive: true, authoredValue: "fallback" },
  baseUrl: { required: false, authoredValue: "fallback", default: "http://127.0.0.1:8030" },
});

type SecretReference = BindingValueRef<string, string, "secret-string">;
type TextReference = BindingValueRef<string, string, "string">;

export interface TriggerOptions extends JobsServiceOptions {
  readonly projectRef?: string | TextReference;
  readonly secretKey?: SecretReference;
  readonly baseUrl?: string | URL | TextReference;
  readonly native?: Readonly<Record<string, import("@relkit/contracts").JsonValue>>;
}

export type TriggerBehavior = JobsServiceBehavior;
export type TriggerAdapter<Options extends TriggerOptions = TriggerOptions> = ProviderAdapter<
  typeof job,
  "trigger",
  ProviderConnectionValues,
  ProviderBehavior<TriggerBehavior>
>;

export const triggerIntegration = integration;
export const triggerConnectionContract = connectionContract;
export const triggerLocalRecipe = localRecipe;

export function trigger<const Options extends TriggerOptions = TriggerOptions>(
  options: Options = {} as Options,
): TriggerAdapter<Options> {
  assertOptions(options);
  return defineProviderAdapter({
    integration,
    capability: job,
    adapterId: "trigger",
    connectionContract,
    connection: {
      ...(options.projectRef === undefined ? {} : { projectRef: value(options.projectRef) }),
      ...(options.secretKey === undefined ? {} : { secretKey: options.secretKey }),
      ...(options.baseUrl === undefined ? {} : { baseUrl: urlValue(options.baseUrl) }),
    },
    behavior: defineProviderBehavior(serializeJobsServiceOptions(options, options.native)),
    features: [durable, retryable],
    localRecipe,
  }) as TriggerAdapter<Options>;
}

function assertOptions(options: TriggerOptions): void {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Trigger options must be an object");
  validateJobsServiceOptions(options);
  const keys = new Set([
    "projectRef", "secretKey", "baseUrl", "native", "limits", "workers", "observation",
    "maxElapsed", "hookTimeout", "shutdownGrace",
  ]);
  for (const key of Object.keys(options)) if (!keys.has(key)) throw new TypeError("Unknown Trigger option " + key);
  for (const [name, candidate] of [["projectRef", options.projectRef]] as const) {
    if (candidate !== undefined && !isBindingValueRef(candidate) && (typeof candidate !== "string" || candidate.trim() === ""))
      throw new TypeError("Trigger " + name + " is invalid");
  }
  if (options.secretKey !== undefined && (!isBindingValueRef(options.secretKey) || options.secretKey.type !== "secret-string" || !options.secretKey.sensitive))
    throw new TypeError("Trigger secretKey must be a named secret binding value");
  if (options.baseUrl !== undefined) urlValue(options.baseUrl);
}

function value(input: string | TextReference): string | TextReference {
  return isBindingValueRef(input) ? input : input;
}

function urlValue(value: undefined): undefined;
function urlValue(value: string | URL | TextReference): string | TextReference;
function urlValue(value: string | URL | TextReference | undefined): string | TextReference | undefined {
  if (value === undefined || isBindingValueRef(value)) return value;
  const url = value instanceof URL ? value : new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError("Trigger baseUrl must use http or https");
  return url.toString();
}
