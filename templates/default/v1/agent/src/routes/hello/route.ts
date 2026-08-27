import { defineRoute } from "@relkit/app";
import hello from "../../functions/hello.function.js";

export const GET = defineRoute({
  id: "hello.http",
  target: hello,
});
