import type { RawRouteDescriptor, RouteDescriptor } from "./route.types.js";
import type {
  ServiceRouteMethod,
  ServiceRouteMethodMarker,
} from "./define-service-routes.types.js";
import type { InferInput, StandardSchemaV1 } from "../schema/index.js";

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

/** The method a service route table bound the value to, when it differs from its export name. */
type RenamedServiceRoute<Value, Method> =
  Value extends ServiceRouteMethodMarker<infer Bound extends ServiceRouteMethod>
    ? [Bound] extends [Method]
      ? never
      : Bound
    : never;

type CheckedRoute<Value, Method, Parameters extends string> = 0 extends 1 & Value
  ? never
  : [MissingPathInput<Value, Parameters>] extends [never]
    ? [RenamedServiceRoute<Value, Method>] extends [never]
      ? Method extends "ALL"
        ? RawRouteDescriptor<string>
        : RouteDescriptor<string>
      : { readonly __relkit_service_route_method: RenamedServiceRoute<Value, Method> }
    : { readonly __relkit_missing_path_input: MissingPathInput<Value, Parameters> };

type CheckedMethods<Methods, Parameters extends string> = {
  readonly [Method in keyof Methods]: Method extends ServiceRouteMethod
    ? CheckedRoute<Methods[Method], Method, Parameters>
    : never;
};

/**
 * Expected types for a route module's exports, used by generated module validators.
 * Rejects untyped exports and requires at least one HTTP method: a named export, or a
 * `defineServiceRoutes` map exported as the default.
 */
export type RouteModuleContract<
  Module,
  Parameters extends string = never,
> = keyof Module extends never
  ? { readonly __relkit_route_method_required: never }
  : {
      readonly [Method in keyof Module]: Method extends "default"
        ? CheckedMethods<Module[Method], Parameters>
        : Method extends RouteModuleMethod
          ? CheckedRoute<Module[Method], Method, Parameters>
          : never;
    };
