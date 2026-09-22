export interface TriggerDeploymentProfile {
  readonly provider: "trigger";
  readonly compatibility: "unverified";
  readonly adapterId: "trigger";
  readonly sdk: "4.5.16";
  readonly dockerImageDigest: "sha256:3563088912cf4b880602d99815ddd787274c4ce5fc77738adf1e5bad287fbd1e";
  readonly dockerDurableSleep: false;
  readonly managedStatus: "not-tested";
  readonly scheduleVariants: readonly string[];
  readonly workerRuntime: "bun";
  readonly executionLimits: Readonly<{
    readonly inputBytes: number;
    readonly progressBytes: number;
    readonly maxRunList: number;
  }>;
  readonly policyIdentity: readonly string[];
}

export interface TriggerWorkerPublication {
  readonly provider: "trigger";
  readonly mechanism: "trigger-sdk";
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly serviceGeneration: string;
  readonly entrypoint: string;
}

export const deploymentProfile: TriggerDeploymentProfile = Object.freeze({
  provider: "trigger",
  compatibility: "unverified",
  adapterId: "trigger",
  sdk: "4.5.16",
  dockerImageDigest: "sha256:3563088912cf4b880602d99815ddd787274c4ce5fc77738adf1e5bad287fbd1e",
  dockerDurableSleep: false,
  managedStatus: "not-tested",
  scheduleVariants: [],
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
  value: Omit<TriggerWorkerPublication, "provider" | "mechanism">,
): TriggerWorkerPublication {
  return Object.freeze({ provider: "trigger", mechanism: "trigger-sdk", ...value });
}
