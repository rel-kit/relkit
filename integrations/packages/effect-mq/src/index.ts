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
const retryable = defineProviderFeature(job, "retryable");
const schedules = defineProviderFeature(job, "native-scheduling");
const integration = defineIntegrationReference("effect-mq");
const localRecipe = defineLocalRecipeReference(integration, "effect-mq-docker", 2);
const connectionContract = defineConnectionContract({
  postgresUrl: { required: false, sensitive: true, authoredValue: "fallback" },
  schema: { required: false, authoredValue: "fallback", default: "public" },
  tablePrefix: { required: false, authoredValue: "fallback", default: "effect_mq" },
  queue: { required: false, authoredValue: "fallback", default: "default" },
});

type SecretReference = BindingValueRef<string, string, "secret-string">;
type TextReference = BindingValueRef<string, string, "string">;

export interface EffectMqOptions extends JobsServiceOptions {
  readonly postgresUrl?: string | TextReference | SecretReference;
  readonly schema?: string;
  readonly tablePrefix?: string;
  readonly queue?: string;
  readonly native?: Readonly<Record<string, import("@relkit/contracts").JsonValue>>;
}

export type EffectMqBehavior = JobsServiceBehavior;
export type EffectMqAdapter<Options extends EffectMqOptions = EffectMqOptions> = ProviderAdapter<
  typeof job,
  "effect-mq",
  ProviderConnectionValues,
  ProviderBehavior<EffectMqBehavior>
>;

export const effectMqIntegration = integration;
export const effectMqConnectionContract = connectionContract;
export const effectMqLocalRecipe = localRecipe;

export function effectMq<const Options extends EffectMqOptions = EffectMqOptions>(
  options: Options = {} as Options,
): EffectMqAdapter<Options> {
  assertOptions(options);
  return defineProviderAdapter({
    integration,
    capability: job,
    adapterId: "effect-mq",
    connectionContract,
    connection: {
      ...(options.postgresUrl === undefined ? {} : { postgresUrl: value(options.postgresUrl) }),
      ...(options.schema === undefined ? {} : { schema: options.schema }),
      ...(options.tablePrefix === undefined ? {} : { tablePrefix: options.tablePrefix }),
      ...(options.queue === undefined ? {} : { queue: options.queue }),
    },
    behavior: defineProviderBehavior(serializeJobsServiceOptions(options, options.native)),
    features: [retryable, schedules],
    localRecipe,
  }) as EffectMqAdapter<Options>;
}

function assertOptions(options: EffectMqOptions): void {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("effect-mq options must be an object");
  validateJobsServiceOptions(options);
  const keys = new Set([
    "postgresUrl",
    "schema",
    "tablePrefix",
    "queue",
    "native",
    "limits",
    "workers",
    "observation",
    "maxElapsed",
    "hookTimeout",
    "shutdownGrace",
  ]);
  for (const key of Object.keys(options)) {
    if (!keys.has(key)) throw new TypeError("Unknown effect-mq option " + key);
  }
  if (
    options.postgresUrl !== undefined &&
    !isBindingValueRef(options.postgresUrl) &&
    typeof options.postgresUrl !== "string"
  )
    throw new TypeError("effect-mq postgresUrl is invalid");
  for (const [name, candidate] of [
    ["schema", options.schema],
    ["tablePrefix", options.tablePrefix],
    ["queue", options.queue],
  ] as const) {
    if (candidate !== undefined && (candidate.trim() === "" || candidate.includes("\0")))
      throw new TypeError("effect-mq " + name + " is invalid");
  }
}

function value(
  input: string | TextReference | SecretReference,
): string | TextReference | SecretReference {
  if (isBindingValueRef(input)) return input;
  const url = new URL(input);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    throw new TypeError("effect-mq postgresUrl must use postgres protocol");
  return url.toString();
}
