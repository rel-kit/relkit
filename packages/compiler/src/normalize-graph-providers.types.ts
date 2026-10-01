import type { ProviderBindingNode } from "@relkit/graph";

/** Validated provider adapter, source, connection, and local service metadata. */
export type BindingProjection = Omit<ProviderBindingNode, "kind" | "id" | "source">;
