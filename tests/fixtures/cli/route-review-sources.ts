/** Defines concrete public SDK source used by grouped route admission acceptance; descriptors retain plain TypeScript authoring. */

/** Native function source with a deliberately non-path-shaped input contract. */
export const routeReviewFunction = `
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({ id: "users.example", input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }), handler: async ({ value }) => ({ value }) });`;

/** One public service boundary exposing the original native function descriptor. */
export const routeReviewService = `
import { defineService } from "@relkit/app/services";
import example from "./functions/example.function.js";
export default defineService({ id: "users", functions: { example } });`;

/** Native route imports retain the real grouped service path and the SDK request-mapping type. */
export const routeReviewPrefix = `import service from "@app/services/users/service.js";
import { defineServiceRoutes, http, type ServiceRouteOptions } from "@relkit/app/routes";`;
