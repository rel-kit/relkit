import type * as contracts from "@relkit/contracts";

/** Contract for internal endpoint mode used by internal endpoints. */
export type InternalEndpointMode = "development" | "test" | "production";

/** Contract for internal query used by internal endpoints. */
export interface InternalQuery {
  readonly cursor?: string;
  readonly limit: number;
  readonly from?: string;
  readonly to?: string;
  readonly severity?: string;
  readonly routeId?: string;
  readonly functionId?: string;
  readonly outcome?: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

/** Contract for internal page used by internal endpoints. */
export interface InternalPage {
  readonly [key: string]: contracts.JsonValue;
  readonly items: readonly contracts.JsonValue[];
  readonly nextCursor?: string;
}

/** Contract for internal readiness used by internal endpoints. */
export interface InternalReadiness {
  readonly ready: boolean;
  readonly reason?: string;
}

/** Contract for internal stream event used by internal endpoints. */
export interface InternalStreamEvent {
  readonly [key: string]: contracts.JsonValue;
  readonly cursor: string;
  readonly type: string;
  readonly data: contracts.JsonValue;
}

/** Contract for query source used by internal endpoints. */
export type QuerySource =
  | contracts.JsonValue
  | InternalPage
  | ((query: InternalQuery) => contracts.MaybePromise<contracts.JsonValue | InternalPage>);

/** Contract for value source used by internal endpoints.
 * @typeParam T - Value type retained by this operation.
 */
export type ValueSource<T> = T | (() => contracts.MaybePromise<T>);

/** internal endpoint options configuring dependencies, callbacks and runtime policy. */
export interface InternalEndpointOptions {
  readonly mode?: InternalEndpointMode;
  readonly environment?: InternalEndpointMode;
  readonly enabled?: boolean;
  readonly bearerToken?: string;
  readonly authorize?: (request: Request) => contracts.MaybePromise<boolean>;
  readonly graph?: ValueSource<contracts.JsonValue>;
  readonly readiness?: ValueSource<InternalReadiness>;
  readonly ready?: ValueSource<InternalReadiness>;
  readonly requests?: QuerySource;
  readonly logs?: QuerySource;
  readonly traces?: QuerySource;
  readonly diagnostics?: QuerySource;
  readonly stream?:
    | ValueSource<readonly InternalStreamEvent[]>
    | ((query: InternalQuery) => contracts.MaybePromise<readonly InternalStreamEvent[]>);
}
