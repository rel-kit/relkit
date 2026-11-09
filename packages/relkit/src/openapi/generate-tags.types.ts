import type { ServiceNode } from "../graph/index.js";

/** A named top-level OpenAPI tag.
 * @example const tag: OpenApiTag = { name: "orders" };
 */
export interface OpenApiTag {
  readonly name: string;
  readonly description?: string;
}

/** Service metadata used to derive route and document tags.
 * @example const source: ServiceTagSource = { id: "orders" };
 */
export type ServiceTagSource = Pick<ServiceNode, "id" | "title" | "description" | "tags">;
