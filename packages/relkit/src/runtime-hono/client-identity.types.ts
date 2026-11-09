import type { MaybePromise } from "../contracts/index.js";
import type { ExpectedClientIdentity, JobsClientProtocol } from "../contracts/index.js";

/** Contract for resolved client identity used by client identity. */
export interface ResolvedClientIdentity extends ExpectedClientIdentity {
  readonly setCookies?: readonly string[];
}

/** Contract for client identity headers used by client identity. */
export type ClientIdentityHeaders = Readonly<Record<string, string | string[] | undefined>>;

/** Contract for client identity runtime used by client identity. */
export interface ClientIdentityRuntime {
  readonly applicationId: string;
  readonly publicFingerprint: string;
  readonly jobs?: JobsClientProtocol;
  readonly resolve: (input: {
    readonly request: Request;
    readonly session: unknown | null;
  }) => MaybePromise<ResolvedClientIdentity>;
}
