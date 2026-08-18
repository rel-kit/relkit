import type * as pulumi from "@pulumi/pulumi";
import type { ZsysContainerRegistry } from "../ZsysContainerRegistry/index.js";
import type { ZsysNetwork } from "../ZsysNetwork/index.js";
import type { ZsysComponentArgs, ZsysEnvironmentInput, ZsysSecretInput } from "../common.js";

export interface ZsysApplicationServiceArgs extends ZsysComponentArgs {
  readonly network: ZsysNetwork;
  readonly registry: ZsysContainerRegistry;
  readonly image?: pulumi.Input<string>;
  readonly imageTag?: pulumi.Input<string>;
  readonly containerName?: string;
  readonly containerPort?: number;
  readonly livenessPath?: string;
  readonly readinessPath?: string;
  readonly cpu?: pulumi.Input<string>;
  readonly memory?: pulumi.Input<string>;
  readonly desiredCount?: pulumi.Input<number>;
  readonly minCapacity?: pulumi.Input<number>;
  readonly maxCapacity?: pulumi.Input<number>;
  readonly cpuTargetPercent?: pulumi.Input<number>;
  readonly stopTimeoutSeconds?: number;
  readonly healthCheckGracePeriodSeconds?: pulumi.Input<number>;
  readonly deregistrationDelaySeconds?: number;
  readonly logRetentionDays?: pulumi.Input<number>;
  readonly internalLoadBalancer?: pulumi.Input<boolean>;
  /** Non-secret values injected into the application container by deployment. */
  readonly environment?: ZsysEnvironmentInput;
  /** Secret source identifiers injected as ECS `valueFrom` mappings. */
  readonly secrets?: ZsysSecretInput;
}
