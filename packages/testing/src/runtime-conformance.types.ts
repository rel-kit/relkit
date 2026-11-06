/** Inputs of the shared runtime adapter conformance suite. */
import type { RuntimeAdapter } from "relkit/runtime";
import type { ConformanceCase } from "./conformance.types.js";

/** What a runtime adapter supplies to run the suite. */
export interface RuntimeConformanceOptions {
  /** The adapter under test, such as `nodeRuntime` from `relkit/runtime/node`. */
  readonly adapter: RuntimeAdapter;
  /**
   * `process` for runtimes with a listener, a filesystem and child processes (Bun, Node);
   * `isolate` for runtimes without them (Cloudflare Workers), whose adapter must refuse those
   * operations instead.
   */
  readonly kind: "process" | "isolate";
  /** A variable set in the environment of the run, read back through the adapter. */
  readonly environment?: { readonly name: string; readonly value: string };
  /** An existing file the `files` case opens (process runtimes). */
  readonly file?: { readonly path: string; readonly contents: string };
  /** Executable of the runtime under test, such as `process.execPath` (process runtimes). */
  readonly executable?: string;
  /** Directory from which the `modules` case resolves `relkit` (process runtimes). */
  readonly resolveFrom?: string;
}

/** Case ids of the runtime suite. */
export type RuntimeConformanceCaseId =
  | "naming"
  | "crypto"
  | "environment"
  | "serve"
  | "websocket-helper"
  | "files"
  | "processes"
  | "modules";

/** One runtime conformance case. */
export type RuntimeConformanceCase = ConformanceCase<RuntimeConformanceCaseId>;
