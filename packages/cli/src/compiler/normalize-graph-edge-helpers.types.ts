/** Graph edge accumulator preserving canonical identity and dependency kind. */
export type GraphEdgeAdder = (
  kind: string,
  from: string,
  to: string,
  metadata?: string | Record<string, unknown>,
) => void;
