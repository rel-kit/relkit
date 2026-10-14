/** Normalizes native package I/O and export contract failures at the smoke adapter boundary. */
import { Data } from "effect";

export class PackageExportFailure extends Data.TaggedError("PackageExportFailure")<{
  /** Fixed native or pure-contract stage; never fixture source content. */
  readonly operation: string;
  /** Original native/contract Error provenance retained for local diagnostics. */
  readonly cause: Error;
}> {}
