/**
 * Server-only runtime ownership, typed failures and borrowed-work composition.
 * @packageDocumentation
 */
export { activateDrizzleService, type DrizzleActivation } from "./activation.js";
export { drizzleRuntimeOf } from "./service.js";
export type { DrizzleServiceDescriptor } from "./types.js";
export { DrizzleFailure, nativeCall, runDrizzlePromise, squashDrizzleCause } from "./failure.js";
export {
  DrizzleOwner,
  drizzleOwnerLayer,
  withDrizzleWork,
  drizzleInstrumentationOf,
  runDrizzleWorkPromise,
} from "./owner.js";
export { observeSpecializedOperation, runSpecializedTrace } from "./operation-tracing.js";
export type { DrizzleOwnerInterface } from "./owner.types.js";
export { operationEffect } from "./operations.js";
export { withDrizzleSqliteWork } from "./coordination.js";
export { inheritNativeLeases } from "./native-leases.js";
export { redactSpecializedTrace } from "./trace-redaction.js";
