/** Pure manifest projection preserves route/middleware bindings and real grouped source contracts. */
import {
  GENERATOR_VERSION,
  MANIFEST_VERSION,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "relkit/contracts";
import type { RegistrationPlan } from "relkit/graph";
import type { RuntimeManifest } from "relkit/runtime-hono";
import normalizeOrderId from "../../../examples/commerce/src/routes/transforms/orders/normalize-id.transform.ts";
import orderAuth from "../../../examples/commerce/src/routes/middleware/order-auth.middleware.ts";
import { ALL as authRoute } from "../../../examples/commerce/src/routes/api/auth/[[...auth]]/route.ts";
import { POST as exportOrdersRoute } from "../../../examples/commerce/src/routes/orders/export/route.ts";
import { POST as createOrderRoute } from "../../../examples/commerce/src/routes/orders/route.ts";

/**
 * Binds native route handlers without registering service-internal functions as HTTP handlers.
 * @param plan - Authoritative compiled route plan.
 * @returns An identity-matched manifest with unchanged policies.
 */
export function commerceHttpManifest(plan: RegistrationPlan): RuntimeManifest {
  return {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: plan.graphHash,
    activationFingerprint: {
      graphHash: plan.graphHash,
      manifestHash: "sha256:commerce-http-manifest",
      runtimeIntegrationsPlanHash: "sha256:commerce-http-runtime-integrations",
    },
    runtimeIntegrationsPlan: {
      version: RUNTIME_INTEGRATION_PLAN_VERSION,
      fileName: RUNTIME_INTEGRATION_PLAN_FILE,
      graphHash: plan.graphHash,
    },
    functions: {},
    routes: {
      "route.all.api.auth.optional-catch-all-auth": { handler: authRoute.handler },
      "orders.export": { handler: exportOrdersRoute.handler },
      // The generated manifest binds every route descriptor; this one carries a response option.
      "route.post.orders": createOrderRoute,
    },
    middleware: {
      "order-auth": {
        path: orderAuth.path,
        handler: async (
          _context: Parameters<typeof orderAuth.handler>[0],
          next: Parameters<typeof orderAuth.handler>[1],
        ) => next(),
      },
    },
    requestTransforms: { "orders.normalize-id": normalizeOrderId.schema },
  };
}
