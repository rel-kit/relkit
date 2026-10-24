/** Server-only remote authority with no application module evaluation. */
import type { Effect } from "effect";
import type {
  InspectionConnectionFile,
  InspectionConnectionError,
} from "@relkit/inspector-api/connection";

/** Single-shot requests preserve native operation IDs; callers never retry mutations. */
export interface InspectorRemoteOperations {
  readonly request: (
    connection: InspectionConnectionFile,
    path: string,
    options?: RequestInit,
    target?: string,
  ) => Effect.Effect<Response, InspectionConnectionError>;
  readonly json: (response: Response) => Effect.Effect<string, InspectionConnectionError>;
}
