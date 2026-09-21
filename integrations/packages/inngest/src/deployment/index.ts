export interface InngestDeploymentProfile {
  readonly provider: "inngest";
  readonly compatibility: "native";
  readonly adapterId: "inngest";
  readonly sdk: "inngest@4.20.0";
  readonly serverImageDigest: string;
  readonly profile: "self-hosted-docker";
  readonly workerRuntime: "bun";
  readonly executionLimits: Readonly<{
    readonly inputBytes: number;
    readonly progressBytes: number;
    readonly maxRunList: number;
  }>;
  readonly policyIdentity: readonly string[];
}

export interface InngestWorkerPublication {
  readonly provider: "inngest";
  readonly mechanism: "inngest-sdk";
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly serviceGeneration: string;
  readonly entrypoint: string;
}

export const deploymentProfile: InngestDeploymentProfile = Object.freeze({
  provider: "inngest",
  compatibility: "native",
  adapterId: "inngest",
  sdk: "inngest@4.20.0",
  serverImageDigest: "sha256:169c1d84801db304ca3c2c267810c67141c8f17bf7c01557b024a9a02fe67e57",
  profile: "self-hosted-docker",
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
  value: Omit<InngestWorkerPublication, "provider" | "mechanism">,
): InngestWorkerPublication {
  return Object.freeze({ provider: "inngest", mechanism: "inngest-sdk", ...value });
}
