/** Real raw-route declaration loaded by the native public application cleanup fixture. */
import { defineRoute } from "@relkit/routes";

export const cleanupRoute = defineRoute({
  id: "cleanup.route",
  handler: async () => new Response("ok"),
});
