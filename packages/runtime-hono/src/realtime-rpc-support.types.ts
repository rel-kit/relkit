import type { ChannelCheckpoint } from "@relkit/realtime";

/** Public subscribe input validated before domain admission. */
export interface SubscribeInput {
  readonly channel: string;
  readonly params: unknown;
  readonly after?: ChannelCheckpoint;
  readonly expectedIdentity?: import("@relkit/contracts").ExpectedClientIdentity;
}
