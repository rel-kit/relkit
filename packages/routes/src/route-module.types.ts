import type { RawRouteDescriptor, RouteDescriptor } from "./route.types.js";
import type { ServiceRouteMethod } from "./define-service-routes.types.js";
import type { InferInput, StandardSchemaV1 } from "@relkit/schema";

/** Value exports accepted by a filesystem route module. */
export type RouteModuleMethod = ServiceRouteMethod | "ALL";

type MissingPathInput<Value, Parameters extends string> = Value extends {
  readonly target: { readonly input: infer Schema extends StandardSchemaV1 };
  readonly request?: infer Request;
}
  ? Exclude<Request, undefined> extends never
    ? Exclude<Parameters, keyof InferInput<Schema>>
    : never
  : never;

type CheckedRoute<Value, Method, Parameters extends string> = 0 extends 1 & Value
  ? never
  : [MissingPathInput<Value, Parameters>] extends [never]
    ? Method extends "ALL"
      ? RawRouteDescriptor<string>
      : RouteDescriptor<string>
    : { readonly __relkit_missing_path_input: MissingPathInput<Value, Parameters> };

/**
 * Expected types for a route module's exports, used by generated module validators.
 * Rejects untyped exports and requires at least one named HTTP method.
 */
export type RouteModuleContract<
  Module,
  Parameters extends string = never,
> = keyof Module extends never
  ? { readonly __relkit_route_method_required: never }
  : {
      readonly [Method in keyof Module]: Method extends RouteModuleMethod
        ? CheckedRoute<Module[Method], Method, Parameters>
        : never;
    };
