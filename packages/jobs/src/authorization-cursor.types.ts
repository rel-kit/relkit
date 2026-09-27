import type { JsonValue } from "@relkit/contracts";
import type { JobClientOperation } from "@relkit/contracts/jobs";
/** Trusted job and scope identity bound into a pagination cursor. */
export interface JobCursorBinding {
  readonly application?: string;
  readonly environment?: string;
  readonly scope: string;
  readonly subject?: string;
  readonly jobId: string;
  readonly operation: JobClientOperation;
  readonly filters: JsonValue;
  readonly schema: string;
  readonly position: JsonValue;
}
/** Options accepted for job cursor operations. */
export interface JobCursorOptions {
  readonly key: string | Uint8Array;
  readonly keyId?: string;
}
