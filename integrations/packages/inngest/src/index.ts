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

const job = defineProviderCapability("job");
const durable = defineProviderFeature(job, "durable");
const integration = defineIntegrationReference("inngest");
const localRecipe = defineLocalRecipeReference(integration, "inngest-docker", 2);
const connectionContract = defineConnectionContract({
  appId: { required: false, authoredValue: "fallback", default: "relkit" },
  baseUrl: { required: false, authoredValue: "fallback", default: "http://127.0.0.1:8288" },
  eventKey: { required: false, sensitive: true, authoredValue: "fallback" },
  signingKey: { required: false, sensitive: true, authoredValue: "fallback" },
  serveOrigin: { required: false, authoredValue: "fallback" },
  appVersion: { required: false, authoredValue: "fallback", default: "relkit" },
});

type SecretReference = BindingValueRef<string, string, "secret-string">;
type TextReference = BindingValueRef<string, string, "string">;

export interface InngestOptions {
  readonly appId?: string;
  readonly baseUrl?: string | URL | TextReference;
  readonly eventKey?: SecretReference;
  readonly signingKey?: SecretReference;
  readonly serveOrigin?: string | URL | TextReference;
  readonly appVersion?: string;
}

export type InngestBehavior = Readonly<Record<never, never>>;
export type InngestAdapter<Options extends InngestOptions = InngestOptions> = ProviderAdapter<
  typeof job,
  "inngest",
  ProviderConnectionValues,
  ProviderBehavior<InngestBehavior>
>;

export const inngestIntegration = integration;
export const inngestConnectionContract = connectionContract;
export const inngestLocalRecipe = localRecipe;

/** Defines a native Inngest durable-jobs adapter without importing the SDK. */
export function inngest<const Options extends InngestOptions = InngestOptions>(
  options: Options = {} as Options,
): InngestAdapter<Options> {
  assertOptions(options);
  return defineProviderAdapter({
    integration,
    capability: job,
    adapterId: "inngest",
    connectionContract,
    connection: {
      ...(options.appId === undefined ? {} : { appId: options.appId }),
      ...(options.baseUrl === undefined ? {} : { baseUrl: urlValue(options.baseUrl) }),
      ...(options.eventKey === undefined ? {} : { eventKey: options.eventKey }),
      ...(options.signingKey === undefined ? {} : { signingKey: options.signingKey }),
      ...(options.serveOrigin === undefined ? {} : { serveOrigin: urlValue(options.serveOrigin) }),
      ...(options.appVersion === undefined ? {} : { appVersion: options.appVersion }),
    },
    behavior: defineProviderBehavior({}),
    features: [durable],
    localRecipe,
  }) as InngestAdapter<Options>;
}

function assertOptions(options: InngestOptions): void {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Inngest options must be an object");
  const keys = new Set(["appId", "baseUrl", "eventKey", "signingKey", "serveOrigin", "appVersion"]);
  for (const key of Object.keys(options)) if (!keys.has(key)) throw new TypeError(`Unknown Inngest option "${key}"`);
  for (const [name, value] of [["appId", options.appId], ["appVersion", options.appVersion]] as const)
    if (value !== undefined && (typeof value !== "string" || value.trim() === "")) throw new TypeError(`Inngest ${name} is invalid`);
  for (const [name, value] of [["eventKey", options.eventKey], ["signingKey", options.signingKey]] as const)
    if (value !== undefined && (!isBindingValueRef(value) || value.type !== "secret-string" || !value.sensitive)) throw new TypeError(`Inngest ${name} must be a named secret binding value`);
  urlValue(options.baseUrl);
  urlValue(options.serveOrigin);
}

function urlValue(value: undefined): undefined;
function urlValue(value: string | URL | TextReference): string | TextReference;
function urlValue(value: string | URL | TextReference | undefined): string | TextReference | undefined;
function urlValue(value: string | URL | TextReference | undefined): string | TextReference | undefined {
  if (value === undefined || isBindingValueRef(value)) return value;
  const url = value instanceof URL ? value : new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError("Inngest URL must use http or https");
  return url.toString();
}
