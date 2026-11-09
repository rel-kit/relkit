/** Checks that `http.from` reads only fields a typed middleware provides, with their types. */
import { defineMiddleware, http, type HttpMappingOutput } from "relkit/routes";
import { z } from "relkit/schema";

const tenant = defineMiddleware("/orders/*", {
  provides: z.object({ tenantId: z.string(), plan: z.number() }),
  handler: async (_context, next, relkit) => {
    await relkit.provide({ tenantId: "acme", plan: 2 });
    // @ts-expect-error provided data must match the provides schema
    await relkit.provide({ tenantId: 1, plan: 2 });
    await next();
  },
});

const tenantId: HttpMappingOutput<ReturnType<typeof http.from<typeof tenant, "tenantId">>> = "acme";
void tenantId;
const plan: number = null as unknown as HttpMappingOutput<
  ReturnType<typeof http.from<typeof tenant, "plan">>
>;
void plan;
// @ts-expect-error the middleware provides no userId
http.from(tenant, "userId");

// Hono-style middleware keeps its plain signature and provides nothing to http.from.
const logger = defineMiddleware("*", async (_context, next) => next());
// @ts-expect-error plain middleware has no provided fields
http.from(logger, "tenantId");
