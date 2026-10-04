/** The Next configuration shape accepted and returned by the client build adapter. */
export type NextConfig = Readonly<Record<string, unknown>> & {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly turbopack?: Readonly<Record<string, unknown>> & { readonly root?: string };
};
