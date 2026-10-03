/** Client contract publication options; enabled by default when installed. */
export interface ClientContractEndpointOptions {
  /** Set false to omit the document route. */
  readonly enabled?: boolean;
  /** Generated client contract; an empty object is served when absent. */
  readonly document?: unknown;
}
