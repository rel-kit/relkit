/** Runtime schemas indexed by response ID or route-ID/response-ID pair. */
export type ResponseSchemaEntries =
  Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown>;

/** Compiled response metadata inspected defensively at the transport boundary. */
export type ResponseDeclaration = Record<string, unknown>;
