import { Schema } from "effect";

import type { RuntimeIntegrationPlanErrorCode } from "./runtime-integration-plan.types.js";

/** Legacy synchronous validation error; Effect callers receive RuntimeIntegrationPlanFailure. */
export class RuntimeIntegrationPlanError extends TypeError {
  readonly code: RuntimeIntegrationPlanErrorCode;
  readonly integrationId: string;

  /**
   * Retains the rejected integration and its diagnostic category.
   * @param code - Stable runtime integration diagnostic code.
   * @param integrationId - Integration whose registration was rejected.
   * @param message - Actionable metadata rejection message.
   */
  constructor(code: RuntimeIntegrationPlanErrorCode, integrationId: string, message: string) {
    super(message);
    this.name = "RuntimeIntegrationPlanError";
    this.code = code;
    this.integrationId = integrationId;
  }
}

/** Expected package ownership or registration mismatch, retaining the legacy error identity. */
export class RuntimeIntegrationPlanFailure extends Schema.TaggedError<RuntimeIntegrationPlanFailure>()(
  "RuntimeIntegrationPlanFailure",
  { cause: Schema.Defect() },
) {}

/** Expected unsafe runtime import metadata, retaining the legacy TypeError. */
export class RuntimeIntegrationImportFailure extends Schema.TaggedError<RuntimeIntegrationImportFailure>()(
  "RuntimeIntegrationImportFailure",
  { cause: Schema.Defect() },
) {}
