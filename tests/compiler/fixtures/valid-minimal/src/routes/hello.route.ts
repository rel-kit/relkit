import { defineRoute, http } from "@zsys/app";
import hello from "../functions/hello.function.js";

const route = defineRoute({
  id: "hello.route",
  method: "GET",
  path: "/hello/:name",
  target: hello,
  request: http.input({ name: http.path("name") }),
  responses: [http.success(200, hello.output)],
});

export default route;
