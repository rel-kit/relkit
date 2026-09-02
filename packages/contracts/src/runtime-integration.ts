export const RUNTIME_INTEGRATION_PLAN_VERSION = 1 as const;
export const RUNTIME_INTEGRATION_PLAN_FILE = "runtime-integrations.plan.json" as const;

export interface RuntimeIntegrationPlanReference {
  readonly version: typeof RUNTIME_INTEGRATION_PLAN_VERSION;
  readonly fileName: typeof RUNTIME_INTEGRATION_PLAN_FILE;
  readonly graphHash: string;
}

export interface RuntimeIntegrationRegistrationMetadata {
  readonly capability: string;
  readonly adapterId: string;
  readonly protocolVersion: number;
}

export interface RuntimeIntegrationModuleMetadata {
  readonly kind: "runtime-integration";
  readonly integrationId: string;
  readonly registrations: readonly RuntimeIntegrationRegistrationMetadata[];
}

export interface RuntimeIntegrationPlanEntry {
  readonly integrationId: string;
  readonly capability: string;
  readonly adapterId: string;
  readonly protocolVersion: number;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
}

export interface RuntimeIntegrationPlan {
  readonly version: typeof RUNTIME_INTEGRATION_PLAN_VERSION;
  readonly graphHash: string;
  readonly integrations: readonly RuntimeIntegrationPlanEntry[];
}

export class RuntimeIntegrationPlanVersionError extends TypeError {
  readonly code = "RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED" as const;

  constructor(version: unknown) {
    super(
      `Runtime-integration plan version ${String(version)} is unsupported; expected ${RUNTIME_INTEGRATION_PLAN_VERSION}. Regenerate with \`relkit check\`.`,
    );
    this.name = "RuntimeIntegrationPlanVersionError";
  }
}

export function assertRuntimeIntegrationPlanVersion(
  value: unknown,
): asserts value is RuntimeIntegrationPlan {
  if (!isRecord(value) || value.version !== RUNTIME_INTEGRATION_PLAN_VERSION)
    throw new RuntimeIntegrationPlanVersionError(isRecord(value) ? value.version : undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
