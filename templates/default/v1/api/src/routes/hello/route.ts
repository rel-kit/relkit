import { defineRoute } from "@relkit/app/routes";
import hello from "@app/functions/hello.function.js";

export const GET = defineRoute({
  target: hello,
});
