import { defineRoute } from "@zsys/app";
import hello from "../../functions/hello.function.js";

export const GET = defineRoute({
  target: hello,
});
