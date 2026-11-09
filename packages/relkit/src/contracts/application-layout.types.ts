/**
 * Defines internal application layout evidence and ownership results shared by
 * compiler and scaffolding. Filesystem scanning and symlink resolution belong to
 * consumers; this contract describes normalized authored paths without live I/O.
 */

/** Supported fixed service roots; empty projects select grouped scaffolding. */
export type ApplicationLayoutKind = "flat" | "grouped";

/** A graph-visible declaration, including a service whose boundary is missing. */
export interface ServiceLayoutEvidence {
  readonly file: string;
  readonly kind: string;
}

/** Physical service location with an identity-neutral logical name. */
export interface ServiceSource {
  readonly layout: ApplicationLayoutKind;
  readonly name: string;
  readonly root: string;
  readonly boundary: string;
  readonly relative: string;
}

/** Deterministic structural rejection with all conflicting physical locations. */
export interface ServiceLayoutIssue {
  readonly code: "RELKIT_SERVICE_LAYOUT";
  readonly file: string;
  readonly related: readonly string[];
  readonly message: string;
}

/** Immutable selection; issues prevent consumers from publishing or mutating. */
export interface ApplicationLayout {
  readonly projectRoot: string;
  readonly kind: ApplicationLayoutKind;
  readonly evidence: readonly ServiceLayoutEvidence[];
  readonly services: readonly ServiceSource[];
  readonly issues: readonly ServiceLayoutIssue[];
}

/** Application dependency layer derived from selected, evidenced ownership. */
export type ApplicationSourceLayer =
  | { readonly kind: "service"; readonly service: ServiceSource }
  | { readonly kind: "routes" | "platform" | "config" | "unowned" | "tooling" };
