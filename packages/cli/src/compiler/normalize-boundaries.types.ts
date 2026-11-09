/** Authoring source layers used by dependency boundary checks. */
export type Layer =
  | { readonly kind: "domain"; readonly domain: string }
  | { readonly kind: "routes" | "platform" | "config" | "other" };
