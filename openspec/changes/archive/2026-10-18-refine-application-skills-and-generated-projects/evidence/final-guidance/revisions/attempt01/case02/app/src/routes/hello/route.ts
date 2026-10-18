import { defineRoute } from "@relkit/app/routes";
import hello from "@app/services/hello/service.js";
export const GET = defineRoute({ id: "route.get.hello", target: hello.hello, client: { operation: "query" } });
