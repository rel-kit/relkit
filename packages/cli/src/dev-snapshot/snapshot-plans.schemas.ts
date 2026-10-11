/**
 * Decodes runtime plan documents without importing the compiler or executable
 * integrations. These bounded codecs mirror the versioned contract fields;
 * graph identity and registration uniqueness remain cohort policy checks.
 */
import { RUNTIME_INTEGRATION_PLAN_VERSION } from "@relkit/contracts";
import { Schema } from "effect";
import { SnapshotHash } from "./snapshot.schemas.js";

/** Portable nonempty identifiers admit package names and versioned export names. */
export const PlanIdentity = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512));

/** Positive protocol versions are bounded safe integers. */
const ProtocolVersion = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 65_535 }),
);

/** Complete runtime registration metadata is required before any module import. */
export const SnapshotIntegrationPlan = Schema.Struct({
  version: Schema.Literal(RUNTIME_INTEGRATION_PLAN_VERSION),
  graphHash: SnapshotHash,
  integrations: Schema.Array(
    Schema.Struct({
      integrationId: PlanIdentity,
      capability: PlanIdentity,
      adapterId: PlanIdentity,
      protocolVersion: ProtocolVersion,
      packageName: PlanIdentity,
      packageVersion: PlanIdentity,
      exportName: PlanIdentity,
    }),
  ).check(Schema.isMaxLength(2_048)),
});

/** Local recipe references contain provenance, never materialized secret values. */
export const SnapshotLocalPlan = Schema.Struct({
  version: Schema.Literal(1),
  graphHash: SnapshotHash,
  services: Schema.Array(
    Schema.Struct({
      bindingId: PlanIdentity,
      capability: PlanIdentity,
      profile: PlanIdentity,
      materializerId: PlanIdentity,
      recipe: Schema.Struct({
        integrationId: PlanIdentity,
        recipeId: PlanIdentity,
        recipeVersion: ProtocolVersion,
      }),
      configuration: Schema.Json,
      requiredBy: Schema.Array(PlanIdentity).check(Schema.isMaxLength(20_000)),
    }),
  ).check(Schema.isMaxLength(2_048)),
});
