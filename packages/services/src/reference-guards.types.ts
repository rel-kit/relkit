import type { Ref } from "@relkit/contracts";

/** A stable reference to one service descriptor.
 * @example const ref: ServiceRef<"orders"> = { ref: createRef("service", "orders") };
 */
export interface ServiceRef<Id extends string = string> {
  readonly ref: Ref<"service", Id>;
}

/** Any service reference regardless of its stable ID.
 * @example function inspect(value: ServiceRefAny) { return value.ref.id; }
 */
export type ServiceRefAny = ServiceRef;
