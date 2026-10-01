import { defineFunction } from "@relkit/functions";
import { defineService } from "@relkit/services";
import {
  defineRoute,
  defineServiceRoutes,
  http,
  type RouteModuleContract,
  type ServiceRouteOptions,
} from "@relkit/routes";
import { z } from "@relkit/schema";

type Assert<Expected, Actual extends Expected> = Actual;
const example = defineFunction({
  id: "users.example",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async ({ value }) => ({ value }),
});
const service = defineService({ id: "users", functions: { example } });
const inferred = defineServiceRoutes(service, { GET: "example" });
// @ts-expect-error An inferred [id] route must declare id in its target input schema
type MissingPath = Assert<RouteModuleContract<typeof inferred, "id">, typeof inferred>;
type StaticPath = Assert<RouteModuleContract<typeof inferred>, typeof inferred>;
const explicit = defineServiceRoutes(service, {
  GET: {
    member: "example",
    request: http.input({ value: http.path("id") }),
  },
});
type RenamedPath = Assert<RouteModuleContract<typeof explicit, "id">, typeof explicit>;
const annotatedOptions: ServiceRouteOptions<"example", typeof example> = {
  member: "example",
  request: http.input({ value: http.path("id") }),
};
const annotated = defineServiceRoutes(service, { GET: annotatedOptions });
type AnnotatedPath = Assert<RouteModuleContract<typeof annotated, "id">, typeof annotated>;
const noRequest = defineServiceRoutes(service, { GET: { member: "example", request: undefined } });
// @ts-expect-error Explicit undefined still infers the filename path input
type UndefinedRequestPath = Assert<RouteModuleContract<typeof noRequest, "id">, typeof noRequest>;
const raw = { GET: defineRoute({ handler: () => new Response("ok") }) };
type RawPath = Assert<RouteModuleContract<typeof raw, "id">, typeof raw>;
const direct = { GET: defineRoute({ target: example }) };
// @ts-expect-error Direct function routes have the same inferred input contract
type DirectMissingPath = Assert<RouteModuleContract<typeof direct, "id">, typeof direct>;
const valid = defineFunction({
  id: "users.valid",
  input: z.object({ id: z.string(), value: z.string() }),
  output: z.object({ value: z.string() }),
  handler: async ({ value }) => ({ value }),
});
const declared = { GET: defineRoute({ target: valid }) };
type DeclaredPath = Assert<RouteModuleContract<typeof declared, "id">, typeof declared>;
