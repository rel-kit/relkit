/** JSON event payload and optional replay ID serialized as one SSE block. */
export interface ServerSentEvent {
  readonly data: unknown;
  readonly id?: string;
}
