import { defineRoute, http } from "@zsys/app";
import hello from "../functions/hello.function.js";

export default defineRoute({
  id: "hello.http",
  method: "GET",
  path: "/hello",
  target: hello,
  request: http.input({ name: http.query("name", { default: "world" }) }),
  responses: [http.success(200, hello.output), http.validationError()],
});
