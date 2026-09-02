import type { JsonValue } from "@relkit/contracts";
import type {
  AccessOperationPlan,
  ConnectedBindingPlan,
  DeploymentIntegrationPlan,
  InfrastructureOperationPlan,
} from "./plan-integrations.js";
import { assertDeploymentPlanShape } from "./plan-validation.js";
export { DeploymentPlanValidationError } from "./plan-validation.js";

/** Versioned, JSON-safe protocol name for deployment plans. */
export const DEPLOYMENT_PLAN_PROTOCOL = "relkit.deployment-plan" as const;
/** Current provider-neutral deployment-plan contract version. */
export const DEPLOYMENT_PLAN_VERSION = 3 as const;
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
  readonly input: JsonValue;
}

export interface EventTriggerDeploymentPlan extends DeploymentCapabilityPlan {
  readonly targetFunctionId: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly delivery: "ephemeral" | "durable";
  readonly retry?: JsonValue;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
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
  readonly engine: DeploymentIntegrationPlan<"engine">;
  readonly host: DeploymentIntegrationPlan<"host">;
  readonly connectedBindings: readonly ConnectedBindingPlan[];
  readonly infrastructureOperations: readonly InfrastructureOperationPlan[];
  readonly accessOperations: readonly AccessOperationPlan[];
  readonly http: HttpDeploymentPlan;
  readonly jobs: readonly JobDeploymentPlan[];
  readonly schedules: readonly ScheduleDeploymentPlan[];
  readonly events: readonly EventDeploymentPlan[];
  readonly eventTriggers: readonly EventTriggerDeploymentPlan[];
  readonly buckets: readonly BucketDeploymentPlan[];
  readonly caches: readonly CacheDeploymentPlan[];
  readonly iam: DeploymentIamPlan;
}

export class DeploymentPlanVersionError extends TypeError {
  readonly code = "RELKIT_DEPLOYMENT_PLAN_VERSION_UNSUPPORTED" as const;

  constructor(version: unknown) {
    super(
      `Deployment plan version ${String(version)} is unsupported; expected ${DEPLOYMENT_PLAN_VERSION}. Regenerate with \`relkit deploy preview\`.`,
    );
    this.name = "DeploymentPlanVersionError";
  }
}

export function assertDeploymentPlanVersion(value: unknown): asserts value is DeploymentPlan {
  if (!isRecord(value) || value.contractVersion !== DEPLOYMENT_PLAN_VERSION)
    throw new DeploymentPlanVersionError(isRecord(value) ? value.contractVersion : undefined);
  assertDeploymentPlanShape(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
