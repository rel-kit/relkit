import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import type { RuntimeIntegrationPlan } from "./runtime-integration.types.js";
export type {
  RuntimeIntegrationModuleMetadata,
  RuntimeIntegrationPlan,
  RuntimeIntegrationPlanEntry,
  RuntimeIntegrationPlanReference,
  RuntimeIntegrationRegistrationMetadata,
} from "./runtime-integration.types.js";
export const RUNTIME_INTEGRATION_PLAN_VERSION = 1 as const;
export const RUNTIME_INTEGRATION_PLAN_FILE = "runtime-integrations.plan.json" as const;
/**
 * Tagged failure when the current runtime cannot read an integration plan.
 * The `version` field records the unsupported input; `code` remains stable for callers.
 * @example Effect.catchTag("RuntimeIntegrationPlanVersionError", (error) => Effect.logWarning(error.message));
 */
// TODO(better-pkg): Use Data.TaggedError after TypeError-based callers migrate.
// Audit TypeError guards in packages/runtime-hono/src/agent-rpc-errors.ts,
// agent-protocol-support.ts, agent-inspector.ts, packages/cli/src/commands/dev-telemetry.ts,
// and packages/client/src/jobs/reconcile.ts before removing this compatibility.
export class RuntimeIntegrationPlanVersionError extends TypeError {
  readonly _tag = "RuntimeIntegrationPlanVersionError" as const;
  readonly code = "RELKIT_RUNTIME_INTEGRATION_PLAN_VERSION_UNSUPPORTED" as const;
  constructor(readonly version: unknown) {
    super(`Runtime-integration plan version ${String(version)} is unsupported; expected ${RUNTIME_INTEGRATION_PLAN_VERSION}. Regenerate with \`relkit check\`.`);
    this.name = "RuntimeIntegrationPlanVersionError";
  }
}
/**
 * Validates the wire version of a runtime integration plan.
 * @param value - Candidate plan.
 * @returns An Effect completing with a typed plan, or the version error.
 * @example Effect.runSync(assertRuntimeIntegrationPlanVersionEffect(plan));
 */
export function assertRuntimeIntegrationPlanVersionEffect(
  value: unknown,
): Effect.Effect<RuntimeIntegrationPlan, RuntimeIntegrationPlanVersionError> {
  return observeContract(
    "runtime-integration.assert-version",
    Effect.gen(function* () {
      if (!isRecord(value) || value.version !== RUNTIME_INTEGRATION_PLAN_VERSION) {
        return yield* Effect.fail(
          new RuntimeIntegrationPlanVersionError(isRecord(value) ? value.version : undefined),
        );
      }
      return value as unknown as RuntimeIntegrationPlan;
    }),
  );
}
/**
 * Synchronous compatibility assertion for integration plan versions.
 * @param value - Candidate plan.
 * @returns Nothing; narrows the input to RuntimeIntegrationPlan.
 * @throws RuntimeIntegrationPlanVersionError for unsupported versions.
 * @example assertRuntimeIntegrationPlanVersion(plan);
 */
export function assertRuntimeIntegrationPlanVersion(
  value: unknown,
): asserts value is RuntimeIntegrationPlan {
  runContract(assertRuntimeIntegrationPlanVersionEffect(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
