import type { ChannelCheckpoint } from "../realtime/index.js";

/** Public subscribe input validated before domain admission. */
export interface SubscribeInput {
  readonly channel: string;
  readonly params: unknown;
  readonly after?: ChannelCheckpoint;
  readonly expectedIdentity?: import("../contracts/index.js").ExpectedClientIdentity;
}
