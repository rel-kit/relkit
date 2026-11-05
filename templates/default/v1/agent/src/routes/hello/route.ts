/** Maps the HTTP endpoint to its owning service's public member. */
import { defineRoute } from "relkit/routes";
import hello from "@app/services/hello/service.js";

export const GET = defineRoute({
  target: hello.hello,
});
