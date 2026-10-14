/** Maps the HTTP endpoint to its owning service's public member. */
import { defineRoute } from "@relkit/app/routes";
import hello from "@app/services/hello/service.js";

export const GET = defineRoute({ target: hello.hello, client: { operation: "query" } });
