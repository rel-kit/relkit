import type * as pulumi from "@pulumi/pulumi";
import type { RelkitContainerRegistry } from "../RelkitContainerRegistry/index.js";
import type { RelkitNetwork } from "../RelkitNetwork/index.js";
import type { RelkitComponentArgs, RelkitEnvironmentInput, RelkitSecretInput } from "../common.js";

export interface RelkitApplicationServiceArgs extends RelkitComponentArgs {
  readonly network: RelkitNetwork;
  readonly registry: RelkitContainerRegistry;
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
  readonly environment?: RelkitEnvironmentInput;
  /** Secret source identifiers injected as ECS `valueFrom` mappings. */
  readonly secrets?: RelkitSecretInput;
}
