import type { ProviderBindingNode } from "../graph/index.js";

/** Required capability/profile inferred from one logical resource. */
export type ExpectedProvider = Pick<ProviderBindingNode, "capability" | "profile">;
