/** Canonical route parameter spelling and catch-all/optional semantics. */
export interface PathParameter {
  readonly name: string;
  readonly catchAll: boolean;
  readonly optional: boolean;
}
