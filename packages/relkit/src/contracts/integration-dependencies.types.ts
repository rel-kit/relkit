/**
 * Exposes schema-derived dependency metadata without duplicating its wire shape.
 * Requirements remain data: discovery and startup own resolution and activation.
 */
import type * as Schemas from "./integration-dependencies.schemas.js";

/** A selected operation phase; deployment SDKs need not exist at runtime. */
export type IntegrationDependencyPhase = typeof Schemas.IntegrationDependencyPhase.Type;

/** A package, supported range and its capability/phase selection conditions. */
export type IntegrationDependencyRequirement = typeof Schemas.IntegrationDependencyRequirement.Type;
