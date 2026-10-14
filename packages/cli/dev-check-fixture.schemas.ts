/** Decodes the actual evaluator/descendant PID file before native liveness probes consume it. */
import { Schema } from "effect";

/** Native process identifiers published as one complete JSON array by the controlled evaluator fixture. */
export const ProcessIds = Schema.Array(Schema.Number);
