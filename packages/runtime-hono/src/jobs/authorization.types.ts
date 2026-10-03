import type { JobAccessGrant, JobAccessRequest } from "@relkit/contracts/jobs";
import type { TrustedJobScope } from "./types.js";

/** Contract for authorized job operation used by authorization. */
export interface AuthorizedJobOperation {
  readonly grant: JobAccessGrant;
  readonly trusted: TrustedJobScope;
  readonly request: JobAccessRequest;
}
