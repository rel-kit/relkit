/** Whether a middleware path always or conditionally covers a runtime route. */
export type MiddlewareRouteMatch = "always" | "conditional";

/** Stable middleware identity, runtime path, order, and route coverage. */
export interface MiddlewareRouteReference {
  readonly id: string;
  readonly path: string;
  readonly order: number;
  readonly match: MiddlewareRouteMatch;
}
