import type { MISSING } from "./request-mapping-body.js";
import type * as Schemas from "./request-mapping-body.schemas.js";

/** Contract for missing used by request mapping body. */
export type Missing = typeof MISSING;

/** Contract for body issue code used by request mapping body. */
export type BodyIssueCode = typeof Schemas.BodyIssueCode.Type;

/** Contract for body issue used by request mapping body. */
export type BodyIssue = typeof Schemas.BodyIssue.Type;

/** Contract for form data like used by request mapping body. */
export interface FormDataLike {
  readonly getAll: (name: string) => readonly unknown[];
}

/** Contract for body value used by request mapping body.
 * @typeParam T - Value type retained by this operation.
 */
export interface BodyValue<T> {
  readonly value: T | Missing;
  readonly issue?: BodyIssue;
}

/** State owned by request mapping body. */
export interface BodyState {
  readonly request: Request;
  readonly maxBodyBytes: number;
  body?: Promise<{ readonly bytes?: Uint8Array; readonly issue?: BodyIssue }>;
  json?: Promise<BodyValue<unknown>>;
  form?: Promise<BodyValue<FormDataLike>>;
}
