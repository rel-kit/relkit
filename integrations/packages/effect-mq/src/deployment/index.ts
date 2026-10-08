import { effectVersion, effectMqSdk } from "../build-catalog.js";

export interface EffectMqDeploymentProfile {
  readonly provider: "effect-mq";
  readonly compatibility: "native";
  readonly adapterId: "effect-mq";
  readonly effect: typeof effectVersion;
  readonly sdk: typeof effectMqSdk;
  readonly database: "postgresql";
  readonly durableSleep: false;
  readonly workerRuntime: "bun";
  readonly executionLimits: Readonly<{
    readonly inputBytes: number;
    readonly progressBytes: number;
    readonly maxRunList: number;
  }>;
  readonly policyIdentity: readonly string[];
}

export interface EffectMqWorkerPublication {
  readonly provider: "effect-mq";
  readonly mechanism: "effect-mq-sdk";
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly serviceGeneration: string;
  readonly entrypoint: string;
}

export const deploymentProfile: EffectMqDeploymentProfile = Object.freeze({
  provider: "effect-mq",
  compatibility: "native",
  adapterId: "effect-mq",
  effect: effectVersion,
  sdk: effectMqSdk,
  database: "postgresql",
  durableSleep: false,
  workerRuntime: "bun",
  executionLimits: { inputBytes: 1_048_576, progressBytes: 65_536, maxRunList: 100 },
  policyIdentity: [
    "taskId",
    "taskVersion",
    "buildId",
    "serviceGeneration",
    "schemaHashes",
    "policy",
  ],
});

export function nativeWorkerPublication(
  value: Omit<EffectMqWorkerPublication, "provider" | "mechanism">,
): EffectMqWorkerPublication {
  return Object.freeze({ provider: "effect-mq", mechanism: "effect-mq-sdk", ...value });
}
