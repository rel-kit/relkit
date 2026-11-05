/** Shapes of the generated Inspector API reference; see protocol-reference.ts. */

/** Who serves an endpoint, which decides how a client authenticates to it. */
export type InspectorEndpointServer = "application" | "bridge" | "inspector";

/** One documented Inspector API endpoint. */
export interface InspectorEndpointReference {
  /** HTTP method exactly as the router registers it. */
  readonly method: string;
  /** Route pattern exactly as the router registers it, with `:name` parameters. */
  readonly path: string;
  /** Protocol version the endpoint belongs to, such as `v1`. */
  readonly version: string;
  /** Process that answers the endpoint. */
  readonly server: InspectorEndpointServer;
  /** How a client authenticates, in one plain sentence. */
  readonly authentication: string;
  /** What the endpoint does, in one short phrase. */
  readonly summary: string;
}
