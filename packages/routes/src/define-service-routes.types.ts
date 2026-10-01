import type { FunctionRefAny } from "@relkit/functions";
import type { ServiceFunctions } from "@relkit/services";
import type { HttpRequestMapping } from "./http-dsl.types.js";
import type { FunctionRouteDescriptor, FunctionRouteOptions } from "./route.types.js";

/** Explicit HTTP methods supported by a service route table.
 * @example const method: ServiceRouteMethod = "GET";
 */
export type ServiceRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
type ServiceFunctionName<Service> = Extract<keyof ServiceFunctions<Service>, string>;
type ServiceFunction<Service, Name extends ServiceFunctionName<Service>> = Extract<
  ServiceFunctions<Service>[Name],
  FunctionRefAny
>;

/** Expanded options selecting one service function.
 * @example type Options = ServiceRouteOptions<"list", typeof list>;
 */
export type ServiceRouteOptions<Name extends string, Target extends FunctionRefAny> = Omit<
  FunctionRouteOptions<string, Target, HttpRequestMapping | undefined>,
  "target"
> & { readonly member: Name };

/** Member name or options for a service route.
 * @example type Entry = ServiceRouteEntry<typeof service>;
 */
export type ServiceRouteEntry<Service> = {
  [Name in ServiceFunctionName<Service>]:
    Name | ServiceRouteOptions<Name, ServiceFunction<Service, Name>>;
}[ServiceFunctionName<Service>];

/** Partial HTTP method table for a service.
 * @example type Options = ServiceRoutesOptions<typeof service>;
 */
export type ServiceRoutesOptions<Service> = Partial<
  Readonly<Record<ServiceRouteMethod, ServiceRouteEntry<Service>>>
>;

type EntryName<Entry> = Entry extends string
  ? Entry
  : Entry extends { readonly member: infer Name extends string }
    ? Name
    : never;

type EntryRequest<Entry> = Entry extends {
  readonly request?: infer Request extends HttpRequestMapping | undefined;
}
  ? Request
  : undefined;

/** Route descriptors inferred from a service route table.
 * @example type Routes = ServiceRoutesResult<typeof service, { GET: "list" }>;
 */
export type ServiceRoutesResult<Service, Options> = Readonly<{
  [Method in keyof Options]: FunctionRouteDescriptor<
    string,
    ServiceFunction<Service, Extract<EntryName<Options[Method]>, ServiceFunctionName<Service>>>,
    EntryRequest<Options[Method]>
  >;
}>;
