/**
 * Describes the TypeScript host observations used to certify prepared checking.
 * Witnesses contain relative paths and text identities, never source text or an
 * absolute project root. The journal is owned by one check, not shared by requests.
 */
import type ts from "typescript";
import type { Effect } from "effect";
import type { TypecheckInputError } from "./typecheck-inputs-error.js";

/** One actual compiler-host read or module-resolution observation. */
export type TypecheckInputWitness =
  | { readonly kind: "read"; readonly path: string; readonly hash: string }
  | {
      readonly kind: "fileExists" | "directoryExists";
      readonly path: string;
      readonly exists: boolean;
    }
  | { readonly kind: "directories"; readonly path: string; readonly entries: readonly string[] };

/** Finite per-check authority supplied only during prepared compilation. */
export interface TypecheckInputOperations {
  /** System callbacks observe config parsing and isolate ancestor resolution. */
  readonly system: ts.System;

  /** Creates a compiler host while retaining its source parser and diagnostic policy. */
  readonly host: (options: ts.CompilerOptions) => ts.CompilerHost;

  /** Returns sorted evidence or rejects a changed, escaped or oversized observation set. */
  readonly evidence: Effect.Effect<readonly TypecheckInputWitness[], TypecheckInputError>;
}

/** Mutable native callback state remains private to one acquired journal. */
export interface TypecheckInputState {
  readonly root: string;
  readonly physicalRoot: string;
  /** Physical dependency aliases mapped to their lexical node_modules identities. */
  readonly dependencyAliases: Map<string, string>;
  readonly witnesses: Map<string, TypecheckInputWitness>;
  failure: "changed" | "escaped" | "oversized" | undefined;
}
