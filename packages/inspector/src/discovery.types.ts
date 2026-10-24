/** Discovery results keep credentials private and never select by PID or file age. */
import type { Effect } from "effect";
import type {
  InspectionConnectionFile,
  InspectionHandshake,
  InspectionConnectionError,
} from "@relkit/inspector-api/connection";
import type { InspectorOptions } from "./options.types.js";

/** Only an authenticated matching handshake grants live forwarding authority. */
export type InspectorSelection =
  | { readonly state: "disconnected"; readonly rejected: number }
  | { readonly state: "ambiguous"; readonly sessions: readonly string[]; readonly rejected: number }
  | {
      readonly state: "connected";
      readonly connection: InspectionConnectionFile;
      readonly handshake: InspectionHandshake;
      readonly rejected: number;
    };

/** Read-only discovery leaves stale and foreign descriptors untouched. */
export interface InspectorDiscoveryOperations {
  readonly select: (
    options: InspectorOptions,
  ) => Effect.Effect<InspectorSelection, InspectionConnectionError>;
}
