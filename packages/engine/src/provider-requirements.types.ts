import type { ProviderBindingNode } from "@relkit/graph";

/** Required capability/profile inferred from one logical resource. */
export type ExpectedProvider = Pick<ProviderBindingNode, "capability" | "profile">;
