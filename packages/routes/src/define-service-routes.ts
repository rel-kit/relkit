import type { FunctionRefAny } from "@relkit/functions";
import {
  isFunctionDescriptor,
  type ServiceDescriptor,
  type ServiceFunctions,
} from "@relkit/services";
import { defineRoute } from "./define-route.js";
import type { HttpRequestMapping } from "./http-dsl.js";
import type { FunctionRouteDescriptor, FunctionRouteOptions } from "./route-types.js";

export const SERVICE_ROUTE_METHODS = Object.freeze([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const);

export type ServiceRouteMethod = (typeof SERVICE_ROUTE_METHODS)[number];

type ServiceFunctionName<Service> = Extract<keyof ServiceFunctions<Service>, string>;
type ServiceFunction<Service, Name extends ServiceFunctionName<Service>> = Extract<
  ServiceFunctions<Service>[Name],
  FunctionRefAny
>;

export type ServiceRouteOptions<Name extends string, Target extends FunctionRefAny> = Omit<
  FunctionRouteOptions<string, Target, HttpRequestMapping | undefined>,
  "target"
> & {
  readonly member: Name;
};

export type ServiceRouteEntry<Service> = {
  [Name in ServiceFunctionName<Service>]:
    Name | ServiceRouteOptions<Name, ServiceFunction<Service, Name>>;
}[ServiceFunctionName<Service>];

export type ServiceRoutesOptions<Service> = Partial<
  Readonly<Record<ServiceRouteMethod, ServiceRouteEntry<Service>>>
>;

type EntryName<Entry> = Entry extends string
  ? Entry
  : Entry extends { readonly member: infer Name extends string }
    ? Name
    : never;

export type ServiceRoutesResult<Service, Options> = Readonly<{
  [Method in keyof Options]: FunctionRouteDescriptor<
    string,
    ServiceFunction<Service, Extract<EntryName<Options[Method]>, ServiceFunctionName<Service>>>
  >;
}>;

/** Creates explicit HTTP route descriptors aligned with a service's public functions. */
export function defineServiceRoutes<
  const Service extends ServiceDescriptor<string, any, any>,
  const Options extends ServiceRoutesOptions<Service>,
>(service: Service, options: Options): ServiceRoutesResult<Service, Options> {
  if (!isRecord(options)) throw new TypeError("Service routes must be an object");
  const routes: Partial<Record<ServiceRouteMethod, FunctionRouteDescriptor<string>>> = {};
  for (const [method, entry] of Object.entries(options)) {
    if (!isServiceRouteMethod(method)) {
      throw new TypeError(`Invalid service route method "${method}"`);
    }
    const route = typeof entry === "string" ? { member: entry } : entry;
    if (!isRecord(route) || typeof route.member !== "string") {
      throw new TypeError(`Service route ${method} needs a member`);
    }
    const target = (service as Record<string, unknown>)[route.member];
    if (!isFunctionDescriptor(target)) {
      throw new TypeError(`Service member "${route.member}" is not a public function`);
    }
    const { member: _member, ...routeOptions } = route;
    routes[method] = defineRoute({ ...routeOptions, target });
  }
  return Object.freeze(routes) as ServiceRoutesResult<Service, Options>;
}

function isServiceRouteMethod(value: string): value is ServiceRouteMethod {
  return SERVICE_ROUTE_METHODS.includes(value as ServiceRouteMethod);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
