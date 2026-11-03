/** Context controlling which graph metadata keys are ephemeral.
 * @example const context: CanonicalContext = "metadata";
 */
export type CanonicalContext = "graph" | "node" | "edge" | "metadata" | "data";
