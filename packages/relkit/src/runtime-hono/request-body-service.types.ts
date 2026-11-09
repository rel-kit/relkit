import type { BodyIssue } from "./request-mapping-body.js";

/** A bounded body read, preserving the existing materialization issue envelope. */
export interface RequestBodyBytes {
  readonly bytes?: Uint8Array;
  readonly issue?: BodyIssue;
}
