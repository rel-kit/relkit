import type { ProviderFactories, ProviderFactory, ProviderFactoryContext } from "@zsys/engine";
import type { AwsCredentials } from "./config.js";
import { createEventBridgeProvider } from "./events.js";
import { createSqsJobProvider } from "./jobs.js";
import { createAwsObservabilityProvider } from "./observability.js";

const sqsFactory: ProviderFactory = Object.freeze({
  capability: "jobs",
  adapter: "sqs",
  create: (context: ProviderFactoryContext) => ({
    value: createSqsJobProvider({
      region: text(context.configuration.region, "SQS region"),
      ...(context.configuration.endpoint === undefined
        ? {}
        : { endpoint: text(context.configuration.endpoint, "SQS endpoint") }),
      ...(context.configuration.queueUrl === undefined
        ? {}
        : { queueUrl: text(context.configuration.queueUrl, "SQS queueUrl") }),
      ...credentialsOption(context.configuration.credentials),
    }),
  }),
});

const eventBridgeFactory: ProviderFactory = Object.freeze({
  capability: "events",
  adapter: "eventbridge",
  create: (context: ProviderFactoryContext) => ({
    value: createEventBridgeProvider({
      region: text(context.configuration.region, "EventBridge region"),
      ...(context.configuration.endpoint === undefined
        ? {}
        : { endpoint: text(context.configuration.endpoint, "EventBridge endpoint") }),
      ...(context.configuration.busName === undefined
        ? {}
        : { busName: text(context.configuration.busName, "EventBridge busName") }),
      ...(context.configuration.source === undefined
        ? {}
        : { source: text(context.configuration.source, "EventBridge source") }),
      ...credentialsOption(context.configuration.credentials),
    }),
  }),
});

const cloudWatchFactory: ProviderFactory = Object.freeze({
  capability: "observability",
  adapter: "cloudwatch",
  create: (_context: ProviderFactoryContext) => {
    const provider = createAwsObservabilityProvider();
    return { value: provider, ready: provider.ready, release: provider.release };
  },
});

export const awsProviderFactories: ProviderFactories = Object.freeze({
  "jobs:sqs": sqsFactory,
  "events:eventbridge": eventBridgeFactory,
  "observability:cloudwatch": cloudWatchFactory,
});

function credentialsOption(value: unknown): { readonly credentials?: AwsCredentials } {
  const configured = record(value);
  if (configured === undefined) return {};
  return {
    credentials: {
      accessKeyId: text(configured.accessKeyId, "AWS accessKeyId"),
      secretAccessKey: text(configured.secretAccessKey, "AWS secretAccessKey"),
      ...(configured.sessionToken === undefined
        ? {}
        : { sessionToken: text(configured.sessionToken, "AWS sessionToken") }),
    },
  };
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is invalid`);
  return value.trim();
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
