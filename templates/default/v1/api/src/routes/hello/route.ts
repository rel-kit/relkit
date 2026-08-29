import { defineRoute } from "@relkit/app/routes";
import hello from "@app/hello/service.js";

export const GET = defineRoute({
  target: hello.hello,
});
