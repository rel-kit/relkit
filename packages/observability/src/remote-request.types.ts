import type { Effect } from "effect";
import type { RemoteRequestError } from "./remote-request-effect.js";

/** Injectable HTTP transport for remote observability operations. */
export interface RemoteFetch {
  readonly execute: (url: string, init: RequestInit) => Effect.Effect<Response, RemoteRequestError>;
}
