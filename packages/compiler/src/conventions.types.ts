import type { SourceLocation } from "@relkit/contracts";

import type { CONVENTION_CODES } from "./conventions.js";

/** Stable warning codes for source authoring conventions. */
export type ConventionCode = (typeof CONVENTION_CODES)[keyof typeof CONVENTION_CODES];

/** Source export evidence used by naming and default-export checks. */
export interface ConventionExport {
  readonly name?: string;
  readonly isDefault?: boolean;
  readonly defaultExport?: boolean;
}

/** Descriptor and source provenance for convention diagnostics. */
export interface ConventionCheckInput {
  readonly descriptor: unknown;
  readonly sourcePath: string;
  readonly projectRoot?: string;
  readonly location?: Pick<SourceLocation, "line" | "column">;
  readonly exportName?: string;
  readonly exportKind?: "default" | "named" | "none";
  readonly isDefaultExport?: boolean;
  readonly defaultExport?: boolean;
  readonly exports?: readonly ConventionExport[];
  readonly fileDescriptors?: readonly unknown[];
  readonly fileKinds?: readonly unknown[];
}

/** Optional root, location, and export evidence for positional convention callers. */
export type ConventionCheckOptions = Omit<ConventionCheckInput, "descriptor" | "sourcePath">;

/** Conventional source category and filename suffix rules. */
export type KindRule = {
  readonly directory: string;
  readonly suffix: string;
};
