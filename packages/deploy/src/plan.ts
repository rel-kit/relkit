import type { JsonValue } from "@zsys/contracts";

/** Versioned, JSON-safe protocol name for deployment plans. */
export const DEPLOYMENT_PLAN_PROTOCOL = "zsys.deployment-plan" as const;
/** Current provider-neutral deployment-plan contract version. */
export const DEPLOYMENT_PLAN_VERSION = 2 as const;
export type DeploymentPlanVersion = typeof DEPLOYMENT_PLAN_VERSION;

export interface DeploymentHealthPlan {
  readonly livenessPath: string;
  readonly readinessPath: string;
  readonly port: number;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
}

export interface ContainerImagePlan {
  readonly name: string;
  readonly tag?: string;
  readonly digest?: string;
  readonly health: DeploymentHealthPlan;
}

export interface ApplicationDeploymentPlan {
  readonly id: string;
  readonly image: ContainerImagePlan;
  /** Names only; values, including secrets, never cross the plan boundary. */
  readonly environmentNames: readonly string[];
}

export interface DeploymentCapabilityPlan {
  readonly id: string;
  readonly logicalName: string;
  readonly bindingId: string;
  readonly profile?: string;
  readonly configurationNames: readonly string[];
  readonly capabilities?: readonly string[];
  readonly tags?: Readonly<Record<string, string>>;
  readonly metadata?: JsonValue;
}

export interface ProviderDeploymentPlan {
  readonly id: string;
  readonly capability: string;
  readonly profile: string;
  readonly adapter: string;
  readonly ownership: "managed";
  readonly configuration: JsonValue;
  readonly environment: readonly {
    readonly name: string;
    readonly type: string;
    readonly sensitive: boolean;
  }[];
}

export interface HttpRouteDeploymentPlan {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly targetFunctionId: string;
}

export interface HttpDeploymentPlan {
  readonly logicalName: string;
  readonly port: number;
  readonly health: DeploymentHealthPlan;
  readonly routes: readonly HttpRouteDeploymentPlan[];
  readonly configurationNames: readonly string[];
}

export interface JobDeploymentPlan extends DeploymentCapabilityPlan {
  readonly targetFunctionId: string;
  readonly profile: string;
  readonly retry?: JsonValue;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly idempotency?: JsonValue;
}

export interface ScheduleDeploymentPlan extends DeploymentCapabilityPlan {
  readonly jobId: string;
  readonly schedule: JsonValue;
}

export interface EventDeploymentPlan extends DeploymentCapabilityPlan {
  readonly version: number;
  readonly payload: JsonValue;
}

export interface EventTriggerDeploymentPlan extends DeploymentCapabilityPlan {
  readonly targetFunctionId: string;
  readonly expansion: readonly string[];
  readonly delivery: "ephemeral" | "durable";
  readonly retry?: JsonValue;
  readonly concurrency?: number;
}

export interface BucketDeploymentPlan extends DeploymentCapabilityPlan {
  readonly profile: string;
  readonly visibility: "private" | "public";
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export interface CacheDeploymentPlan extends DeploymentCapabilityPlan {
  readonly profile: string;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}

export interface ObservabilityDeploymentPlan {
  readonly logicalName: string;
  readonly configurationNames: readonly string[];
  readonly logs: boolean;
  readonly traces: boolean;
  readonly retentionDays?: number;
  readonly export?: {
    readonly enabled: boolean;
    readonly configurationNames: readonly string[];
  };
}

/** One safe, logical-resource IAM statement for the shared application role. */
export interface DeploymentIamStatement {
  readonly capability: string;
  readonly actions: readonly string[];
  /** Stable deployment logical names, never resolved ARNs or secret values. */
  readonly resources: readonly string[];
}

/** Desired isolation metadata retained while the POC uses one shared task role. */
export interface DeploymentFunctionCapability {
  readonly functionId: string;
  readonly capability: string;
  readonly resourceId: string;
  readonly actions: readonly string[];
}

export interface DeploymentIamPlan {
  readonly serviceRole: {
    readonly statements: readonly DeploymentIamStatement[];
  };
  readonly perFunction: readonly DeploymentFunctionCapability[];
}

/** Complete provider-neutral deployment input for the Pulumi adapter. */
export interface DeploymentPlan {
  readonly contractVersion: number;
  readonly graphHash: string;
  readonly application: ApplicationDeploymentPlan;
  readonly providerBindings: readonly ProviderDeploymentPlan[];
  readonly http: HttpDeploymentPlan;
  readonly jobs: readonly JobDeploymentPlan[];
  readonly schedules: readonly ScheduleDeploymentPlan[];
  readonly events: readonly EventDeploymentPlan[];
  readonly eventTriggers: readonly EventTriggerDeploymentPlan[];
  readonly buckets: readonly BucketDeploymentPlan[];
  readonly caches: readonly CacheDeploymentPlan[];
  readonly iam: DeploymentIamPlan;
  readonly observability?: ObservabilityDeploymentPlan;
}
