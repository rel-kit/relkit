import { defineRoute, defineServiceRoutes, type RouteModuleContract } from "@relkit/app/routes";
import { defineFunction } from "@relkit/app/functions";
import { defineService } from "@relkit/app/services";
import { z } from "@relkit/app/schema";

type AssertModule<Expected, Actual extends Expected> = Actual;
const example = defineFunction({
  id: "users.example",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: async ({ id }) => ({ id }),
});
const service = defineService({ functions: { example } });
const table = defineServiceRoutes(service, { GET: "example" });
const raw = defineRoute({ handler: () => new Response("ok") });

type Valid = AssertModule<
  RouteModuleContract<{ GET: typeof table.GET }>,
  { GET: typeof table.GET }
>;
type Raw = AssertModule<RouteModuleContract<{ GET: typeof raw }>, { GET: typeof raw }>;
// @ts-expect-error a route table cannot be exported as an individual method
type Table = AssertModule<RouteModuleContract<{ GET: typeof table }>, { GET: typeof table }>;
// @ts-expect-error untyped exports cannot bypass the module contract
type Untyped = AssertModule<RouteModuleContract<{ GET: any }>, { GET: any }>;
// @ts-expect-error default route exports are unsupported
type Default = AssertModule<RouteModuleContract<{ default: typeof raw }>, { default: typeof raw }>;
// @ts-expect-error TRACE is not a supported method
type Trace = AssertModule<RouteModuleContract<{ TRACE: typeof raw }>, { TRACE: typeof raw }>;
// @ts-expect-error a route module must expose a method
type Empty = AssertModule<RouteModuleContract<{}>, {}>;
// @ts-expect-error ALL requires a raw route, with auth ownership checked by the compiler
type All = AssertModule<RouteModuleContract<{ ALL: typeof table.GET }>, { ALL: typeof table.GET }>;

export type CheckedModules = Valid | Raw;
