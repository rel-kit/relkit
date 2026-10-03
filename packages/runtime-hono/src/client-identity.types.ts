import type { MaybePromise } from "@relkit/contracts";
import type { ExpectedClientIdentity, JobsClientProtocol } from "@relkit/contracts";

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
