/**
 * Defines convention inputs with concrete descriptor and decoded provenance types.
 * Generic callers retain their descriptor input type at the checking boundary;
 * only recognized descriptors/kinds participate in nonfatal warning calculations.
 */
import type { DescriptorKind } from "@relkit/contracts";
import type { Schema } from "effect";
import type * as Models from "./convention-input.schemas.js";

import type { CONVENTION_CODES } from "./convention-findings.js";
import type { Diagnostic } from "@relkit/diagnostics";

/** Stable warning codes for source authoring conventions. */
export type ConventionCode = (typeof CONVENTION_CODES)[keyof typeof CONVENTION_CODES];

/** Source export evidence used by naming and default-export checks. */
export interface ConventionExport extends Schema.Schema.Type<typeof Models.ConventionExport> {}

/** Descriptor and source provenance for convention diagnostics.
 * @typeParam Descriptor - Caller descriptor type preserved until runtime guard validation.
 */
export interface ConventionDescriptor {
  readonly kind: DescriptorKind;
  readonly id: string;
}

export interface ConventionCheckInput<Descriptor = ConventionDescriptor> extends Schema.Schema.Type<
  typeof Models.ConventionProvenance
> {
  readonly descriptor: Descriptor;
  readonly fileDescriptors?: readonly Descriptor[];
  readonly fileKinds?: readonly DescriptorKind[];
}

/** Optional root, location, and export evidence for positional convention callers. */
export type ConventionCheckOptions = Omit<ConventionCheckInput, "descriptor" | "sourcePath">;

/** Conventional source category and filename suffix rules. */
export type KindRule = {
  readonly directory: string;
  readonly suffix: string;
};

/** Invocation-local pure warning accumulator with validated descriptor provenance. */
export interface ConventionFindingContext {
  readonly input: ConventionCheckInput;
  readonly path: string;
  readonly diagnostics: Diagnostic[];
}
