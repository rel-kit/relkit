/** Explicit port precedence inputs; resolving them acquires no resources. */
export interface PortResolutionOptions {
  readonly flag?: number;
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly configured?: number;
}
