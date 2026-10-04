/** Reader derived from the native fetch contract used by the Bun subprocess. */
export type NativeResponseReader = ReturnType<
  NonNullable<Awaited<ReturnType<typeof fetch>>["body"]>["getReader"]
>;
