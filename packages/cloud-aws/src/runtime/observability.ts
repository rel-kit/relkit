import { createObservabilityCollector, type ObservabilityCollector } from "@relkit/observability";

export interface AwsObservabilityProvider extends ObservabilityCollector {
  readonly capabilities: Readonly<{
    readonly logs: true;
    readonly traces: true;
    readonly export: "cloudwatch";
  }>;
  readonly ready: () => Promise<void>;
  readonly release: () => Promise<void>;
}

/** CloudWatch receives the container's structured sink; this adapter keeps the same collector protocol. */
export function createAwsObservabilityProvider(): AwsObservabilityProvider {
  const collector = createObservabilityCollector();
  return Object.freeze({
    ...collector,
    capabilities: Object.freeze({
      logs: true as const,
      traces: true as const,
      export: "cloudwatch" as const,
    }),
    ready: async () => undefined,
    release: async () => collector.clear(),
  });
}
