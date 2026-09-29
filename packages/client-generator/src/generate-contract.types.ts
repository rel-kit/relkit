/** Procedure data accepted by the oRPC contract generator.
 * @example const procedure: ContractProcedureDocument = { name: "orders.get", input: {}, output: {}, errors: [] };
 */
export interface ContractProcedureDocument {
  readonly name: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly errors: readonly { readonly id: string; readonly schema: unknown }[];
}
export type { JsonValue } from "@relkit/contracts";
export type { ApplicationGraph } from "@relkit/graph";
export type { ClientRoute } from "./generate-types.types.js";
