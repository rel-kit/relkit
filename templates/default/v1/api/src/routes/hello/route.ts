import { defineRoute } from "@relkit/app";
import hello from "@app/functions/hello.function.js";

export const GET = defineRoute({
  target: hello,
});
